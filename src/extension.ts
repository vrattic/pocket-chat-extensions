import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';


// -------------------------------------------------------
// EXTENSION ENTRY FUNCTIONS
//
// Functions called by vscode during the extension lifecycle.
// -------------------------------------------------------

/**
 * This method is called by vscode when the extension is activated.
 * @param context The context of the extension.
 */
export function activate(context: vscode.ExtensionContext) {

	console.log('Extension "pocket-chat-extensions" is now active');
	console.log('The extension is running from', context.extensionPath);

	// Register the implementations of the built-in contributions
	registerBuiltInContributions(context);

	// Register the implementations of the user-defined contributions
	registerUserContributions(context);
}

/**
 * This method is called by vscode when the extension is deactivated.
 */
export function deactivate() {
	console.log('Extension "pocket-chat-extensions" is now deactivated');
}


// -------------------------------------------------------
// EXTENSION BUILT-IN IMPLEMENTATIONS
//
// Implementations of the default/built-in contributions.
// -------------------------------------------------------

/**
 * Register the built-in contributions defined in the package.json.
 * @param context The context of the extension
 */
function registerBuiltInContributions(context: vscode.ExtensionContext) {
	registerCommands(context);
	registerParticipants(context);
}

/**
 * Register the implementations of the commands defined in the package.json.
 * @param context The context of the extension.
 */
function registerCommands(context: vscode.ExtensionContext) {

	const newCmd = vscode.commands.registerCommand('pocket-chat-extensions.new', async () => {

		// Check if the user has a workspace opened
		if (!vscode.workspace.workspaceFolders) {
			vscode.window.showErrorMessage('No workspace opened');
			return;
		}

		// Ask the user for the participant name
		const name = await vscode.window.showInputBox({
			prompt: 'Enter the name of the new participant'
		});
		if (!name) {
			vscode.window.showErrorMessage('No participant name provided');
			return;
		}

		// Ask the user for the participant adapter
		let adapter = await vscode.window.showQuickPick([
			'[Default]    Identical to VS Code API implementation', 
			'[Extended]   Same as default but with additional utils'
		], {
			placeHolder: 'Select the adapter for the new participant'
		});
		if (!adapter) {
			vscode.window.showErrorMessage('No adapter selected');
			return;
		}
		adapter = adapter.toLowerCase().split(']')[0].replace('[', ''); // extract the adapter name

		// Create the new participant
		try {
			const uri = await createNewUserParticipant(context, name, adapter);
			// Show the created or modified file
			vscode.window.showTextDocument(uri);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to create participant: ${error}`);
		}
	});

	context.subscriptions.push(newCmd);
}

/**
 * Register the implementations of the built-in participants defined in the package.json.
 * @param context The context of the extension.
 */
function registerParticipants(context: vscode.ExtensionContext) {

	const handler: vscode.ChatRequestHandler = async (
		request: vscode.ChatRequest,
		context: vscode.ChatContext,
		stream: vscode.ChatResponseStream,
		token: vscode.CancellationToken
	): Promise<void> => {
		// TODO: Implement the built-in assistant
		stream.markdown('Coming later...');
	};

	const pocketParticipant = vscode.chat.createChatParticipant('pocket-chat-extensions.participants.pocket', handler);
	context.subscriptions.push(pocketParticipant);
}


// -------------------------------------------------------
// USER CONTRIBUTIONS FILE
//
// Functions to work with the user-defined contributions file
// -------------------------------------------------------

/**
 * Glob pattern to match the user contributions files.
 * 
 * Matching file paths:
 * - .vscode/pocketchat.js
 * - .vscode/pocketchat.foo.js
 * - .vscode/pocketchat.bar.js
 */
const userContributionFilePattern = '{**/.vscode/pocketchat.js,**/.vscode/pocketchat.*.js}';

/**
 * Create a new user participant and add it to the user contributions file.
 * If a contributions file does not exist, it will be created.
 * @param context The context of the extension.
 * @param fullName The name of the new participant.
 * @param adapter The adapter of the new participant.
 * @returns A promise with the Uri of the created or modified contributions file.
 * @throws If no workspace is opened.
 * @throws If the adapter is invalid.
 * @throws If the contributions file cannot be created or modified.
 */
async function createNewUserParticipant(context: vscode.ExtensionContext, fullName: string, adapter: string): Promise<vscode.Uri> {

	// Ensure that a workspace is opened
	if (!vscode.workspace.workspaceFolders) {
		throw new Error('No workspace opened');
	}

	// Prepare the new participant definition object

	/**
	 * Get the default handler for the specified adapter.
	 * @param adapter The adapter of the new participant.
	 * @returns A string with the handler implementation.
	 */
	const getExampleHandler = (adapter: string) => {
		switch (adapter) {
			case 'default':
				return `/**
  * @param {vscode.ChatRequest} request
  * @param {vscode.ChatContext} context
  * @param {vscode.ChatResponseStream} stream
  * @param {vscode.CancellationToken} token
  * @returns {Promise<void>}
  */
	handler: async (request, context, stream, token) => {
		if (request.command === 'bye')
			stream.markdown('Goodbye');
		else
			stream.markdown('Hello');
	}`;
			case 'extended':
				return `/**
  * @param {vscode.ChatRequest} request
  * @param {vscode.ChatContext} context
  * @param {vscode.ChatResponseStream} stream
  * @param {vscode.CancellationToken} token
	* @param {*} utils
  * @returns {Promise<void>}
  */
	handler: async (request, context, stream, token, utils) => {
		if (request.command === 'bye')
			stream.markdown('Goodbye');
		else
			stream.markdown('Hello');
	}`;
			default:
				throw new Error('Invalid adapter');
		}
	};

	// The id name of the new participant should only contain a-z, 0-9, _, and -
	let name = fullName.replace(/[^a-zA-Z0-9-_]/g, '').toLowerCase();
	if (name === '') {
		name = 'newparticipant';
	}

	const participant: UserContribution = {
		name: name,
		fullName: fullName,
		description: 'I am a new custom participant',
		commands: [
			{
				name: 'bye',
				description: 'Say goodbye'
			}
		],
		adapter: adapter,
		// @ts-ignore, the handler will be replaced later
		handler: null
	};
	let json = JSON.stringify(participant, null, 2);

	// Replace the handler with the example implementation
	const exampleHandler = getExampleHandler(adapter);
	json = json.replace('"handler": null', `${exampleHandler}`);

	// Add two spaces before each line to match the indentation
	json = json.replace(/\n/g, '\n  ');

	// Check if the contributions file already exists
	const existingFiles = await vscode.workspace.findFiles(userContributionFilePattern);

	if (existingFiles.length === 0) {
		// Create a new contributions file

		const content = `import * as vscode from 'vscode';

[
  ${json}
]`;
		const filePath = vscode.Uri.file(path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, '.vscode', 'pocketchat.js'));
		await vscode.workspace.fs.writeFile(filePath, Buffer.from(content));
		return filePath;
	}
	else {
		// Load the existing contributions file
		console.log('Existing:', existingFiles);
		const filePath = existingFiles[0];
		const content = await vscode.workspace.fs.readFile(filePath);
		const contentStr = Buffer.from(content).toString();
		// Add before the last ']' a comma and the new participant
		const newContent = contentStr.replace(/](?=[^\]]*$)/, `  ,\n  ${json}\n]`);
		const newContentBuffer = Buffer.from(newContent);
		await vscode.workspace.fs.writeFile(filePath, newContentBuffer);
		return filePath;
	}
}

/**
 * Search and watch the user-defined contributions files. The callback will
 * be called when a contributions file is created, deleted, or changed, as
 * well as when new contrubutions files are found. If a workspace is already open
 * and contributions files are found, the callback will be called immediately.
 * @param context The context of the extension.
 * @param callback The function to execute when any contributions file changes.
 * 		The function will receive an array of paths to all contributions files.
 * @returns A function to stop watching the contributions files.
 */
function watchUserContributionsFiles(context: vscode.ExtensionContext, callback: (paths: vscode.Uri[]) => void): () => void {
	/**
	 * Uris currently being watched.
	 */
	const fileUris: vscode.Uri[] = [];

	/**
	 * Search for contributions files in the opened workspace folders
	 * and call the callback with the updated list.
	 */
	const updateWorkspaceFiles = async () => {
		// Return if no workspace folders
		if (!vscode.workspace.workspaceFolders) {
			return;
		}
		const foundFiles = await vscode.workspace.findFiles(userContributionFilePattern);

		// Add the found files to the list
		foundFiles.forEach(uri => {
			if (!fileUris.includes(uri)) {
				fileUris.push(uri);
			}
		});

		// Call the callback with the found files
		callback(fileUris);
	};

	// If there is already a workspace opened, search for contributions files
	if (vscode.workspace.workspaceFolders) {
		updateWorkspaceFiles();
	}

	// Search for contributions files every time the workspace changes
	vscode.workspace.onDidChangeWorkspaceFolders(() => {
		updateWorkspaceFiles();
	});

	// Create a watcher for the user contributions files
	const watcher = vscode.workspace.createFileSystemWatcher(userContributionFilePattern);
	// on file creation
	watcher.onDidCreate(uri => {
		if (!fileUris.includes(uri)) {
			fileUris.push(uri);
			callback(fileUris);
		}
	});
	// on file deletion
	watcher.onDidDelete(uri => {
		const index = fileUris.indexOf(uri);
		if (index !== -1) {
			fileUris.splice(index, 1);
			callback(fileUris);
		}
	});
	// on file change
	watcher.onDidChange(uri => {
		callback(fileUris);
	});

	// Handle watcher disposal
	context.subscriptions.push(watcher);
	return () => {
		watcher.dispose();
	};
}

type UserContribution = {
	name: string;
	fullName: string;
	description?: string;
	handler: Function;
	adapter: string;
	isSticky?: boolean;
	commands?: { name: string, description: string }[];
};

type UserContributions = UserContribution[];

/**
 * Parses and load the user-defined contributions objects from a list
 * of file paths.
 * @param filePaths The paths to the user-defined contributions files.
 * @returns An UserContributions instance.
 */
async function loadUserContributions(filePaths: vscode.Uri[]): Promise<UserContributions> {

	/**
	 * Load a module from a file path by evaluating the content.
	 * @param filePath The path to the file to load.
	 * @returns The module returned by the file.
	 */
	const loader = async (filePath: vscode.Uri): Promise<any> => {
		if (filePath.fsPath.endsWith('.js')) {
			try {
				// Read the file content
				const content = await vscode.workspace.fs.readFile(filePath);
				let contentStr = Buffer.from(content).toString();

				// Remove import statements
				// TODO: Consider importing the statements in this context
				contentStr = contentStr.replace(/import .+ from .+;/g, '');

				// Evaluate the content as the exported module
				const module = eval(contentStr);

				// Return the loaded module
				return module;

			} catch (error) {
				console.error('Failed to load:', filePath, error);
			}
		} else {
			console.error('Unsupported file type:', filePath);
		}
	};

	/**
	 * Load all modules from the given file paths.
	 * @param filePaths The paths to the files to load.
	 * @returns An array of loaded modules.
	 */
	const loadModules = async (filePaths: vscode.Uri[]) => {
		const promises = filePaths.map(loader);
		const modules = await Promise.all(promises);
		return modules;
	};

	/**
	 * Validate and convert the module into an UserContributions instance
	 * by checking if the module has the expected structure of
	 * UserContributions.
	 * @param module The module to validate.
	 * @returns The UserContributions instance or an empty array.
	 */
	const validateModule = (module: any) => {
		if (!Array.isArray(module)) {
			console.error('Invalid module (Not array):', module);
			return [];
		}
		if (module.some(c => typeof c !== 'object')) {
			console.error('Invalid module (Not objects):', module);
			return [];
		}
		if (module.some(c => !c.name || !c.handler)) {
			console.error('Invalid module (Missing properties):', module);
			return [];
		}
		return module as UserContributions;
	};

	/**
	 * Merge all modules into a single UserContributions instance
	 * without duplicates.
	 * @param modules The modules to merge.
	 * @returns The merged UserContributions instance.
	 */
	const mergeModules = (modules: UserContributions[]) => {
		const contributions: UserContributions = [];
		const names = new Set<string>();
		modules.forEach(module => {
			module.forEach(c => {
				if (!names.has(c.name)) {
					contributions.push(c);
					names.add(c.name);
				} else {
					console.error('Duplicate contribution name:', c.name);
				}
			});
		});
		return contributions;
	};

	// Load all modules and merge them into a single UserContributions instance
	const modules = await loadModules(filePaths);
	console.log('Modules:', modules.map(validateModule));
	const contributions = mergeModules(modules.map(validateModule));

	return contributions;
}


// -------------------------------------------------------
// USER CONTRIBUTIONS IMPLEMENTATIONS
//
// Implementations of the user-defined contributions.
// -------------------------------------------------------

/**
 * Register the implementations of the user-defined contributions.
 * @param context The context of the extension.
 */
function registerUserContributions(context: vscode.ExtensionContext) {
	// Watch the user-defined contributions files
	watchUserContributionsFiles(context, async (filePaths) => {
		// On changes, load the user contributions and apply them

		// Load the user-defined contributions
		const contributions = await loadUserContributions(filePaths);

		// Apply the user contributions to the package.json
		applyUserContributionsToPackageJson(context, contributions);

		// Re-register user-defined participants
		unregisterAllUserParticipants(context);
		registerUserParticipants(context, contributions);
	});
}

/**
 * Apply the user-defined contributions to the extension package.json file.
 * @param context The context of the extension.
 * @param contributions The user-defined contributions to apply.
 */
function applyUserContributionsToPackageJson(context: vscode.ExtensionContext, contributions: UserContributions) {

	// Edit the package.json file to add the user-defined contributions
	editPackageJson(context, (packageJson) => {
		// Add the contributions to the package.json
		packageJson.contributes = packageJson.contributes || {};
		packageJson.contributes.chatParticipants = packageJson.contributes.chatParticipants || [];

		// Remove all user-defined contributions (while keeping the built-in ones)
		const builtInContributions = ['pocket'];
		packageJson.contributes.chatParticipants = packageJson.contributes.chatParticipants.filter((c: any) => builtInContributions.includes(c?.name));

		// Add the user-defined contributions
		contributions.forEach(contribution => {
			// If the contribution is already present, remove it
			const index = packageJson.contributes.chatParticipants.findIndex((c: any) => c.name === contribution.name);
			if (index !== -1) {
				packageJson.contributes.chatParticipants.splice(index, 1);
			}

			// Add the contribution to the package.json
			packageJson.contributes.chatParticipants.push({
				id: `pocket-chat-extensions.participants.${contribution.name}`,
				name: contribution.name,
				fullName: contribution.fullName,
				description: contribution.description,
				isSticky: contribution.isSticky || true,
				commands: contribution.commands || []
			});

			// Always sort the contributions by name to prevent unnecessary changes
			packageJson.contributes.chatParticipants.sort((a: any, b: any) => a?.name?.localeCompare(b?.name, 'en'));
		});
	});
}

/**
 * Keep track of the registered user-defined participants.
 */
const registeredUserParticipants: vscode.ChatParticipant[] = [];

/**
 * Register the user-defined participants.
 * @param context The context of the extension.
 * @param contributions The user-defined contributions to register.
 */
function registerUserParticipants(context: vscode.ExtensionContext, contributions: UserContributions) {
	contributions.forEach(contribution => {
		// Create the chat request handler implementation for the contribution
		const handler = createChatRequestHandler(contribution);

		// Register the participant to vscode
		const participant = vscode.chat.createChatParticipant(`pocket-chat-extensions.participants.${contribution.name}`, handler);

		// Registered participants disposal
		registeredUserParticipants.push(participant);
		context.subscriptions.push(participant);
	});
}

/**
 * Unregister the user-defined participants.
 * @param context The context of the extension.
 */
function unregisterAllUserParticipants(context: vscode.ExtensionContext) {
	// Dispose and remove from the extension subscriptions all registered participants
	registeredUserParticipants.forEach(participant => {
		context.subscriptions.splice(context.subscriptions.indexOf(participant), 1);
		participant.dispose();
	});
	// Clear the list keeping track of the registered participants
	registeredUserParticipants.length = 0;
}


// -------------------------------------------------------
// CUSTOM CHAT REQUEST HANDLERS
//
// Implementations of the custom chat request handlers.
// -------------------------------------------------------

/**
 * Create a chat request handler for the specified user contribution.
 * @param contribution The user contribution to create the handler for.
 * @returns The chat request handler implementation.
 */
function createChatRequestHandler(contribution: UserContribution): vscode.ChatRequestHandler {
	const adapter = contribution.adapter;
	switch (adapter) {
		case 'default':
			return createChatRequestHandlerDefault(contribution);
		case 'extended':
			return createChatRequestHandlerExtended(contribution);
		default:
			throw new Error('Invalid adapter');
	}
}

/**
 * Chat request handler implementation for the "default" adapter.
 * @param contribution The user contribution to create the handler for.
 * @returns The chat request handler implementation.
 */
function createChatRequestHandlerDefault(contribution: UserContribution): vscode.ChatRequestHandler {
	return async (
		request: vscode.ChatRequest,
		context: vscode.ChatContext,
		stream: vscode.ChatResponseStream,
		token: vscode.CancellationToken
	): Promise<void> => {
		await contribution.handler(request, context, stream, token);
	};
}

/**
 * Chat request handler implementation for the "extended" adapter.
 * @param contribution The user contribution to create the handler for.
 * @returns The chat request handler implementation.
 */
function createChatRequestHandlerExtended(contribution: UserContribution): vscode.ChatRequestHandler {
	return async (
		request: vscode.ChatRequest,
		context: vscode.ChatContext,
		stream: vscode.ChatResponseStream,
		token: vscode.CancellationToken
	): Promise<void> => {
		// Define the utils object
		const utils = {
			lm: {
				async generate(prompt: string, family: string = 'fast') {
					const craftedPrompt = [
						vscode.LanguageModelChatMessage.User(prompt)
					];

					if (family === 'best') {family = 'gpt-4';}
					if (family === 'fast') {family = 'gpt-3.5-turbo';}

					try {
						const [model] = await vscode.lm.selectChatModels({
							family: family,
						});
						let completion = "";
						const response = await model.sendRequest(craftedPrompt, {}, token);

						for await (const fragment of response.text) {
							completion += fragment;
						}
						return completion;
					} catch (err) {
						throw err;
					}
				}
			},
			res: {
				append(message: any) {
					stream.markdown(message?.toString() || '');
				},
				appendLn(message: any) {
					this.append(message);
					stream.markdown('\n\n');
				}
			}
		};

		// Execute the handler function (same as default but with utils)
		await contribution.handler(request, context, stream, token, utils);
	};
}


// -------------------------------------------------------
// EXTENSION UTILITIES
//
// Various utility functions used by the extension.
// -------------------------------------------------------

/**
 * Asks the user to reload the extension (requires user confirmation). 
 * @param message The message to display to the user.
 */
function reloadExtension(message: string) {
	vscode.window.showInformationMessage(message, 'Reload Window').then((choice) => {
		if (choice === 'Reload Window') {
			vscode.commands.executeCommand('workbench.action.reloadWindow');
		}
	});
}

/**
 * Get the path to the extension's package.json file.
 * @param context The context of the extension.
 * @returns The path to the package.json file.
 * @throws If the package.json file is not found.
 */
function getPackageJsonPath(context: vscode.ExtensionContext): string {
	const packageJsonPath = path.join(context.extensionPath, 'package.json');
	if (!fs.existsSync(packageJsonPath)) {
		throw new Error('Extension package.json not found');
	}
	return packageJsonPath;
}

/**
 * Edit the package.json file of the extension and reload
 * the extension to apply the changes if necessary.
 * @param context The context of the extension.
 * @param callback The function to modify the package.json.
 */
function editPackageJson(context: vscode.ExtensionContext, callback: (packageJson: any) => void) {
	try {
		// Read the package.json
		const packageJsonPath = getPackageJsonPath(context);
		const data = fs.readFileSync(packageJsonPath, 'utf-8');

		// Create a copy of the original JSON string
		const originalPackageJsonString = data;

		// Parse into a JSON object and pass it to the callback
		const packageJson = JSON.parse(data);
		callback(packageJson);

		// Convert the (maybe changed) object back to a JSON string
		const updatedPackageJson = JSON.stringify(packageJson, null, 2);

		// Compare the original JSON string with the updated JSON string
		const changed = originalPackageJsonString !== updatedPackageJson;

		// If changes were made update the file and reload the extension
		if (changed) {
			fs.writeFileSync(packageJsonPath, updatedPackageJson, 'utf-8');
			reloadExtension('Reload to apply changes');
		} else {
			console.log('No changes were made to package.json');
		}
	} catch (error) {
		console.error(`Failed to update package.json: ${error}`);
	}
}
