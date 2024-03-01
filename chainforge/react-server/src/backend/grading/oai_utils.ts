const { OpenAIClient, AzureKeyCredential } = require("@azure/openai");
import { env as process_env } from "process";
import { EventEmitter } from "events";

export class AzureOpenAIStreamer extends EventEmitter {
  private buffer: string = "";
  private isJsonContentStarted: boolean = false;
  private isPythonContentStarted: boolean = false;
  private pythonBlockBuffer: string = "";

  async genCriteria(prompt: string, model: string): Promise<void> {
    // Clear buffer and reset state
    this.buffer = "";
    this.isJsonContentStarted = false;

    const client = new OpenAIClient(
      process.env.AZURE_OPENAI_ENDPOINT,
      new AzureKeyCredential(process.env.AZURE_OPENAI_KEY),
    );

    const messages = [
      {
        content:
          "You are an expert Python programmer and helping me write assertions for my LLM pipeline. An LLM pipeline accepts an example and prompt template, fills the template's placeholders with the example, and generates a response.",
        role: "system",
      },
      { role: "user", content: prompt },
    ];

    const events = await client.listChatCompletions(model, messages, {});

    for await (const event of events) {
      for (const choice of event.choices) {
        const delta = choice.delta?.content;
        if (delta !== undefined) {
          //   console.log("Received delta:", delta);
          this.processCriteriaDelta(delta);
        }
      }
    }

    this.emit("end"); // Signal that streaming is complete
  }

  private processCriteriaDelta(delta: string): void {
    this.buffer += delta;
    if (!this.isJsonContentStarted) {
      const startIndex = this.buffer.indexOf("```json\n");
      if (startIndex !== -1) {
        this.isJsonContentStarted = true;
        this.buffer = this.buffer.substring(startIndex + 8); // Skip the '```json \n' part
      }
      // Trim the buffer to avoid whitespace at beginning and end
      this.buffer = this.buffer.trim();
    }

    if (this.isJsonContentStarted) {
      this.tryEmitEvalCriteria();
    }
  }

  private tryEmitEvalCriteria(): void {
    let braceCount = 0;
    let lastIndex = 0; // Track start of the next JSON object

    // Detect and handle the start of an array
    if (this.buffer.trim().startsWith("[")) {
      this.buffer = this.buffer.trim().substring(1); // Remove the leading '['
    }

    // Remove leading commas if they exist right before a JSON object
    this.buffer = this.buffer.replace(/^\s*,\s*/, "");

    for (let i = 0; i < this.buffer.length; i++) {
      const char = this.buffer[i];
      if (char === "{") {
        braceCount++;
      } else if (char === "}") {
        braceCount--;
      }

      // When a complete JSON object is detected
      if (braceCount === 0 && char === "}") {
        let jsonStr = this.buffer.substring(lastIndex, i + 1).trim();
        lastIndex = i + 1; // Update for potential next object

        // Remove any leading comma for the next object
        if (this.buffer[lastIndex] === ",") {
          lastIndex++; // Skip the comma for the next object
        }

        try {
          const jsonObj = JSON.parse(jsonStr);
          this.emit("evalCriteria", jsonObj);
        } catch (error) {
          console.error("Error parsing JSON:", error);
        }
      }
    }

    // Keep any incomplete JSON for the next delta
    this.buffer = this.buffer.substring(lastIndex).trim();
  }

  async genLLMEvalPrompts(prompt: string, model: string): Promise<void> {
    // Clear buffer and reset state
    this.buffer = "";
    this.isJsonContentStarted = false;

    const client = new OpenAIClient(
      process.env.AZURE_OPENAI_ENDPOINT,
      new AzureKeyCredential(process.env.AZURE_OPENAI_KEY),
    );

    const messages = [
      {
        content:
          "You are an expert Python programmer and helping me write assertions for my LLM pipeline. An LLM pipeline accepts an example and prompt template, fills the template's placeholders with the example, and generates a response.",
        role: "system",
      },
      { role: "user", content: prompt },
    ];
    const events = await client.listChatCompletions(model, messages, {});

    for await (const event of events) {
      for (const choice of event.choices) {
        const delta = choice.delta?.content;
        if (delta !== undefined) {
          this.processStringDelta(delta);
        }
      }
    }

    this.emit("end"); // Signal that streaming is complete
  }

  private processStringDelta(delta: string): void {
    this.buffer += delta;
    if (!this.isJsonContentStarted) {
      const startIndex = this.buffer.indexOf("```json\n");
      if (startIndex !== -1) {
        this.isJsonContentStarted = true;
        this.buffer = this.buffer.substring(startIndex + 8); // Skip the '```json\n' part
      }
    }

    if (this.isJsonContentStarted) {
      this.tryEmitStrings();
    }
  }

  private tryEmitStrings(): void {
    let quoteCount = 0;
    let lastIndex = 0; // Track the start of the next string

    // Detect and handle the start of an array
    if (this.buffer.startsWith("[")) {
      this.buffer = this.buffer.substring(1); // Remove the leading '['
    }

    // Remove leading commas and whitespace that might be right before a JSON string
    this.buffer = this.buffer.replace(/^\s*,\s*/, "");

    for (let i = 0; i < this.buffer.length; i++) {
      const char = this.buffer[i];

      // Toggle quote count on encountering quotes, ignoring escaped quotes
      if (char === '"' && (i === 0 || this.buffer[i - 1] !== "\\")) {
        quoteCount++;
      }

      // When a complete string is detected (every second quote)
      if (quoteCount === 2) {
        let jsonString = this.buffer.substring(lastIndex, i + 1); // Include the closing quote
        lastIndex = i + 1; // Update for the potential next string

        // Remove any leading comma for the next string
        if (this.buffer[lastIndex] === ",") {
          lastIndex++; // Skip the comma for the next string
        }

        quoteCount = 0; // Reset for the next string

        // Extract the string value from JSON
        try {
          const strValue = JSON.parse(jsonString);
          this.emit("function", strValue);
        } catch (error) {
          console.error("Error parsing JSON string:", error);
        }
      }
    }

    // Keep any incomplete JSON string for the next delta
    this.buffer = this.buffer.substring(lastIndex).trim();
  }

  async genFunctions(prompt: string, model: string): Promise<void> {
    // Clear buffer and reset state
    this.buffer = "";
    this.isPythonContentStarted = false;
    this.pythonBlockBuffer = "";

    const client = new OpenAIClient(
      process.env.AZURE_OPENAI_ENDPOINT,
      new AzureKeyCredential(process.env.AZURE_OPENAI_KEY),
    );

    const messages = [
      {
        content:
          "You are an expert Python programmer and helping me write assertions for my LLM pipeline. An LLM pipeline accepts an example and prompt template, fills the template's placeholders with the example, and generates a response.",
        role: "system",
      },
      { role: "user", content: prompt },
    ];

    const events = await client.listChatCompletions(model, messages, {});

    for await (const event of events) {
      for (const choice of event.choices) {
        const delta = choice.delta?.content;
        if (delta !== undefined) {
          this.processFunctionDelta(delta);
        }
      }
    }

    this.emit("end"); // Signal that streaming is complete
  }

  private processFunctionDelta(delta: string): void {
    this.buffer += delta;
    if (!this.isPythonContentStarted) {
      const startIndex = this.buffer.indexOf("```python");
      if (startIndex !== -1) {
        this.isPythonContentStarted = true;
        this.buffer = this.buffer.substring(startIndex);
      }
    } else {
      const endIndex = this.buffer.indexOf("```", 8); // Look for end marker after the start
      if (endIndex !== -1) {
        // Extract Python code block
        const pythonCode = this.buffer.substring(8, endIndex).trim();
        this.pythonBlockBuffer += pythonCode;
        this.buffer = this.buffer.substring(endIndex + 3);
        this.isPythonContentStarted = false;
        // Now process the Python code block for functions
        this.tryEmitFunctionCriteria();
      }
    }
  }

  private tryEmitFunctionCriteria(): void {
    // Split the buffer into lines
    const lines = this.pythonBlockBuffer.split("\n");
    let collecting = false;
    let functionBody = [];
    let baseIndentation = 0;

    for (const line of lines) {
      if (!collecting) {
        // Check if the line is a function definition
        if (line.trim().startsWith("def ")) {
          collecting = true;
          functionBody = [line];
          // Determine the base indentation level
          baseIndentation = line.indexOf("def");
        }
      } else {
        // Check if the line returns to the base indentation level or lower, indicating the end of the function
        const currentIndentation = line.search(/\S|$/); // Find first non-space character or end of line
        if (currentIndentation <= baseIndentation) {
          // Emit the collected function body
          this.emit("function", functionBody.join("\n"));
          functionBody = []; // Reset for the next function
          collecting = false;

          // If the current line is another function definition, start collecting again
          if (line.trim().startsWith("def ")) {
            collecting = true;
            functionBody = [line];
            baseIndentation = line.indexOf("def");
          }
        } else if (collecting) {
          // Continue collecting the function body
          functionBody.push(line);
        }
      }
    }

    // Check if there's a function body collected at the end of the buffer without returning to the base indentation
    if (collecting && functionBody.length > 0) {
      this.emit("function", functionBody.join("\n"));
    }

    // Clear the buffer after processing
    this.pythonBlockBuffer = "";
  }
}