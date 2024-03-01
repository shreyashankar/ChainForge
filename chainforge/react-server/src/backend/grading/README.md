# Grading and Evaluation Function Selection Module

This module takes a developer's prompt and set of examples (variables, prompts, responses), suggests evaluation criteria (with confirmation from developer + other criteria), generates and evaluates multiple functions per criteria on each of the examples, and returns the best function per criteria (most aligned with the developer's grades).

## Setup

1. Install the required packages by running `npm install` in the `grading` directory of the project.
2. Download the Pyodide core release from [Github](https://github.com/pyodide/pyodide/releases) and place it in the `grading` directory of the project. Download version 0.25.0 to match with the version used in the project. You should extract the zip file to get a `pyodide` folder, which should be in the `grading` directory.

## Execution

There is an interactive script to play with the functionality in `test.ts`. You can run it by running `ts-node test.ts` in the `grading` directory of the project. The terminal is a bit laggy sometimes.

## Architecture

The module is divided into the following components: `executor`, `utils`, `oai_utils`.

### Utils

This module contains types and prompts for criteria generation, function generation, and function execution.

### OAI Utils

This module contains utilities for interacting with the Azure OpenAI API and streaming partial results (e.g., each evaluation criteria as it is generated).

### Executor

This module contains the main logic for the module. It takes a developer's prompt and set of examples, as well as a list of evaluation criteria (which can be generated by the utils module). It has a background process to generate and evaluate functions for each criteria, updating each example's grading priority as function results stream in. There is a method to query the next example to grade, and another method to set the grade for an example. The module also has a method to query the best function per criteria (most aligned with the developer's grades).