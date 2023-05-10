import json, os, asyncio, sys, argparse, threading
from dataclasses import dataclass
from statistics import mean, median, stdev
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO
from flask_app import run_server
from promptengine.query import PromptLLM, PromptLLMDummy
from promptengine.template import PromptTemplate, PromptPermutationGenerator
from promptengine.utils import LLM, is_valid_filepath, get_files_at_dir, create_dir_if_not_exists

# Setup the socketio app
# BUILD_DIR = "../chain-forge/build"
# STATIC_DIR = BUILD_DIR + '/static'
app = Flask(__name__) #, static_folder=STATIC_DIR, template_folder=BUILD_DIR)

# Initialize Socket.IO
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="gevent")

# Set up CORS for specific routes
# cors = CORS(app, resources={r"/api/*": {"origins": "*"}})

# Wait a max of a full 3 minutes (180 seconds) for the response count to update, before exiting.
MAX_WAIT_TIME = 180

def countdown():
    n = 10
    while n > 0:
        socketio.sleep(0.5)
        socketio.emit('response', n, namespace='/queryllm')
        n -= 1

@socketio.on('queryllm', namespace='/queryllm')
def readCounts(data):
    id = data['id']
    max_count = data['max']
    tempfilepath = f'cache/_temp_{id}.txt'

    # Check that temp file exists. If it doesn't, something went wrong with setup on Flask's end:
    if not os.path.exists(tempfilepath):
        print(f"Error: Temp file not found at path {tempfilepath}. Cannot stream querying progress.")
        socketio.emit('finish', 'temp file not found', namespace='/queryllm')

    i = 0
    last_n = 0
    init_run = True
    while i < MAX_WAIT_TIME and last_n < max_count:

        # Open the temp file to read the progress so far:
        try: 
            with open(tempfilepath, 'r') as f:
                queries = json.load(f)
        except FileNotFoundError as e:
             # If the temp file was deleted during executing, the Flask 'queryllm' func must've terminated successfully:
             socketio.emit('finish', 'success', namespace='/queryllm')
             return
        
        # Calculate the total sum of responses
        # TODO: This is a naive approach; we need to make this more complex and factor in cache'ing in future
        n = sum([int(n) for llm, n in queries.items()])
        
        # If something's changed...
        if init_run or last_n != n:
            i = 0
            last_n = n
            init_run = False

            # Update the React front-end with the current progress
            socketio.emit('response', queries, namespace='/queryllm')
            
        else:
            i += 0.1
        
        # Wait a bit before reading the file again
        socketio.sleep(0.1)

    if i >= MAX_WAIT_TIME:
        print(f"Error: Waited maximum {MAX_WAIT_TIME} seconds for response count to update. Exited prematurely.")
        socketio.emit('finish', 'max_wait_reached', namespace='/queryllm')
    else:
        print("All responses loaded!")
        socketio.emit('finish', 'success', namespace='/queryllm')

def run_socketio_server(socketio, port):
    socketio.run(app, host="localhost", port=8001)

if __name__ == "__main__":
    
    parser = argparse.ArgumentParser(description='This script spins up a Flask server that serves as the backend for ChainForge')

    # Turn on to disable all outbound LLM API calls and replace them with dummy calls
    # that return random strings of ASCII characters. Useful for testing interface without wasting $$.
    parser.add_argument('--dummy-responses', 
        help="""Disables queries to LLMs, replacing them with spoofed responses composed of random ASCII characters. 
                Produces each dummy response at random intervals between 0.1 and 3 seconds.""", 
        dest='dummy_responses', 
        action='store_true')
    parser.add_argument('--port', help='The port to run the server on. Defaults to 8000.', type=int, default=8000, nargs='?')
    args = parser.parse_args()

    port = args.port if args.port else 8000

    # Spin up separate thread for socketio app, on port+1 (8001 default)
    print(f"Serving SocketIO server on port {port+1}...")
    t1 = threading.Thread(target=run_socketio_server, args=[socketio, port+1])
    t1.start()

    print(f"Serving Flask server on port {port}...")
    run_server(host="localhost", port=port, cmd_args=args)