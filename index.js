#! /usr/bin/env node

'use strict'

const autocompletePrompt = require('cli-autocomplete')
const jsonStore = require('json-fs-store')
const pkg = require('./package.json')
const envPaths = require('env-paths')
const figures = require('figures')
const thenify = require('thenify')
const mkdirp = thenify(require('mkdirp'))
const chalk = require('chalk')
const path = require('path')
const fs = require('mz/fs')

const appHome = envPaths(pkg.name).data
const appBin = path.join(appHome, 'bin')
const appData = path.join(appHome, 'data')

const store = jsonStore(appData)

const bullet = chalk.green(figures.bullet)

const prompt = (question, suggest, cursor = 0) => new Promise((yay, nay) => {
	autocompletePrompt(question, suggest, {cursor})
	.on('submit', yay)
	.on('error', nay)
})

const removeSimlink = (cliname) => {
	return fs.unlink(path.join(appBin, cliname))
	.catch((err) => {
		if (err.code !== 'ENOENT') throw err 
	})
}

const createSimlink = (version, cliname) => {
	return mkdirp(appBin)
	.then(() => removeSimlink(cliname))
	.then(() => fs.symlink(version, path.join(appBin, cliname)))
}

const update = (object) => {
	return thenify(store.remove)(object.id)
	.then(() => thenify(store.add)(object))
}

const list = (cliname) => {
	return thenify(store.list)()
	.then((objects) => {
		let entryFound = false

		console.log('')
		for (let cli of objects) {
			if (cliname === cli.id || cliname === 'all') {
				entryFound = true
				console.log(chalk.blue(cli.id))
				for (let index in cli.versions) {
					if (cli.version == index) {
						console.log(` ${bullet} ` + (Number(index) + 1) + ': ' + cli.versions[index])
					}
					else {
						console.log('   ' + (Number(index) + 1) + ': ' + cli.versions[index])
					}
				}
				console.log('')
			}
		}

		if (!entryFound) {
			if (cliname === 'all') {
				console.log('No entries found')
			} else {
				console.log('No entries found for ' + cliname)
			}
		}
	})
}

const change = (cliname) => {
	return thenify(store.load)(cliname)
	.then((object) => {
		const suggestVersions = (input) => {
			const versions = object.versions.filter(cli => cli.slice(0, input.length) === input)
			return Promise.resolve(versions.map(cli => ({title: cli, value: cli})))
		}

		return prompt(`To which ${chalk.bold(cliname)} version do you want to switch?`, suggestVersions, object.version)
		.then((version) => {
			const index = object.versions.indexOf(version)
			if (index >= 0) {
				object.version = index
				return update(object)
				.then(() => createSimlink(version, cliname))
				.then(() => `Successfully switched ${chalk.bold(cliname)} to version ${chalk.bold(version)}`)
			} else {
				console.error('This version does not exist!')
				process.exitCode = 1
			}
		})
	})
}

const add = (version) => {
	return thenify(store.list)()
	.then((objects) => {
		const clis = objects.map((cli) => cli.id)

		const suggestCLIs = (input) => {
			const results = clis.filter((cli) => cli.slice(0, input.length) === input)
			if (!results.includes(input)) results.push(input)
			return Promise.resolve(results.map((title) => ({title, value: title})))
		}

		return prompt('To which CLI do you want to add this version?', suggestCLIs)
		.then((cliname) => {
			const index = objects.map((obj) => obj.id).indexOf(cliname)
			if (index >= 0) {
				objects[index].versions.push(version)
				return update(objects[index])
				.then(() => console.log(`\nAdded ${chalk.bold(version)} to ${chalk.bold(cliname)}\n`))
			} else {
				const cli = {'id': cliname, 'version': 0, 'versions': [version]}
				return thenify(store.add)(cli)
				.then(() => createSimlink(version, cliname))
				.then(() => console.log(`\nCreated ${chalk.bold(cliname)} with version ${chalk.bold(version)}\n`))
			}
		})
	})
}

const remove = (cliname) => {
	return thenify(store.load)(cliname)
	.then((object) => {
		if (object.versions.length === 1) {
			return thenify(store.remove)(cliname)
			.then(() => removeSimlink(cliname))
			.then(() => `Successfully removed ${chalk.bold(cliname)} from CLI Version Manager`)
		} else {
			const suggestVersions = (input) => {
				const versions = object.versions.filter(cli => cli.slice(0, input.length) === input)
				return Promise.resolve(versions.map(cli => ({title: cli, value: cli})))
			}

			return prompt('Which version do you want to remove?', suggestVersions)
			.then((version) => {
				const index = object.versions.indexOf(version)
				if (index >= 0) {
					object.versions.splice(index, 1)

					console.log(`Successfully removed ${chalk.bold(version)} from ${chalk.bold(cliname)}`)

					if (object.version == index) {
						object.version = 0
						return createSimlink(object.versions[0], cliname)
						.then(() => console.log(`Switched ${cliname} from ${chalk.bold(version)} to ${chalk.bold(object.versions[0])}`))
					}
				} else {
					console.error('This version does not exist!')
					process.exitCode = 1
				}
			})
			.then(() => update(object))
		}
	})
}

const showVersion = () => {
	console.log(pkg.version)
}

const showHelp = () => {
	console.log('')
	console.log(chalk.cyan('CLI Version Manager'))
	console.log(chalk.cyan(' -h  --help        '), 'Shows this help screen')
	console.log(chalk.cyan(' -V  --version     '), 'Version of clivm')
	console.log(chalk.cyan('     add'), chalk.white('<path>'), '    Add a cli version to clivm')
	console.log(chalk.cyan(' ls  list'), chalk.white('[name]'), '   List all versions of a cli')
	console.log(chalk.cyan(' sw  switch'), chalk.white('<name>'), ' Switch version of a cli')
	console.log(chalk.cyan(' rm  remove'), chalk.white('<name>'), ' Remove version of a cli')
	console.log('')
}

const argv = process.argv.slice(2)
const argvContains = (arg) => argv.indexOf(arg) >= 0

if (argvContains('list') || argvContains('ls')) {
	if (argv.length === 2) {
		list(argv[1])
		.then((res) => res && console.log(res))
		.catch((err) => {
			console.error(err)
			process.exit(1)
		})
	} else {
		list('all')
		.then((res) => res && console.log(res))
		.catch((err) => {
			console.error(err)
			process.exit(1)
		})
	}
} else if (argvContains('switch') || argvContains('sw')) {
	if (argv.length === 2) {
		change(argv[1])
		.then((res) => res && console.log(res))
		.catch((err) => {
			console.error(err)
			process.exit(1)
		})
	} else {
		showHelp()
	}
} else if (argvContains('add')) {
	if (argv.length === 2) {
		add(argv[1])
		.then((res) => res && console.log(res))
		.catch((err) => {
			console.error(err)
			process.exit(1)
		})
	} else {
		showHelp()
	}
} else if (argvContains('remove') || argvContains('rm')) {
	if (argv.length === 2) {
		remove(argv[1])
		.then((res) => res && console.log(res))
		.catch((err) => {
			console.error(err)
			process.exit(1)
		})
	} else {
		showHelp()
	}
} else if (argvContains('-v') || argvContains('--version')) {
	showVersion()
} else if (argvContains('-h') || argvContains('--help')) {
	showHelp()
} else if (argv.length > 0) {
	console.error(chalk.red(`\nUnrecognized command.`))
	showHelp()
	process.exit(1)
} else {
	showHelp()
}
