#! /usr/bin/env node

'use strict'

const autocompletePrompt = require('cli-autocomplete')
const exec = require('child_process').exec
const jsonStore = require('json-fs-store')
const homedir = require('os').homedir()
const chalk = require('chalk')
const path = require('path')
const fs = require('fs')

const clivmHome = path.join(homedir, '.clivm')
const clivmBin = path.join(clivmHome, 'bin')
const clivmData = path.join(clivmHome, 'data')

const store = jsonStore(clivmData)

const noEntriesFound = (cliname) => {
	console.log(`\nNo entries found${cliname ? ' for ' + chalk.bold(cliname) : ''}\n`)
	process.exit(1)
}

const list = (cliname) => {
	store.list((err, objects) => {
		if (err) throw err

		let entryFound = false

		for (let cli of objects) {
			if (cliname === cli.id || cliname === 'all') {
				entryFound = true
				console.log(chalk.blue(cli.id))
				cli.versions.forEach(function(version, index) {
					if (cli.version == index) {
						console.log(' ▸ ' + (index + 1) + ': ' + version)
					}
					else {
						console.log('   ' + (index + 1) + ': ' + version)
					}
				})
				console.log('')
			}
		}

		if (!entryFound) {
			if (cliname === 'all') {
				noEntriesFound()
			} else {
				noEntriesFound(cliname)
			}
		}
	})
}

const change = (cliname, callback) => {
	store.load(cliname, (err, object) => {
		if (err) noEntriesFound(cliname)

		const suggestVersions = (input) => {
			const versions = object.versions.filter(cli => cli.slice(0, input.length) === input)
			return Promise.resolve(versions.map(cli => ({title: cli, value: cli})))
		}

		autocompletePrompt(`To which ${chalk.bold(cliname)} version do you want to switch?`, suggestVersions, {cursor: object.version})
		.on('submit', (version) => {
			const index = object.versions.indexOf(version)
			if (index >= 0) {
				object.version = index
				update(object, () => {
					createSimlink(version, cliname)
					console.log(`\nSuccessfully switched ${chalk.bold(cliname)} to version ${chalk.bold(version)}\n`)
					callback && callback()
				})
			} else {
				console.log(`\nThis version does not exist!\n`)
			}
		})
	})
}

const removeSimlink = (cliname) => {
	exec('rm ' + path.join(clivmBin, cliname))
}

const createSimlink = (version, cliname) => {
	removeSimlink(cliname)
	exec('mkdir -p ' + clivmBin)
	exec(`ln -s ${version} ${path.join(clivmBin, cliname)}`)
}

const add = (version) => {
	store.list((err, objects) => {
		if (err) throw err

		const clis = objects.map((cli) => cli.id)

		const suggestCLIs = (input) => {
			const results = clis.filter((cli) => cli.slice(0, input.length) === input)
			if (!results.includes(input)) results.push(input)
			return Promise.resolve(results.map((title) => ({title, value: title})))
		}

		autocompletePrompt('To which CLI do you want to add this version?', suggestCLIs)
		.on('submit', (cliname) => {
			const index = objects.map((obj) => obj.id).indexOf(cliname)
			if (index >= 0) {
				objects[index].versions.push(version)
				update(objects[index], () => {
					console.log(`\nAdded ${chalk.bold(version)} to ${chalk.bold(cliname)}\n`)
				})
			} else {
				const cli = {'id': cliname, 'version': 0, 'versions': [version]}
				store.add(cli, (err) => {
					if (err) throw err

					createSimlink(version, cliname)
					console.log(`\nCreated ${chalk.bold(cliname)} with version ${chalk.bold(version)}\n`)
				})
			}
		})
	})
}

const remove = (cliname, callback) => {
	store.load(cliname, (err, object) => {
		if (err) noEntriesFound(cliname)

		if (object.versions.length === 1) {
			store.remove(cliname, (err) => {
				if (err) throw err

				removeSimlink(cliname)
				console.log(`\nSuccessfully removed ${chalk.bold(cliname)} from CLI Version Manager\n`)
				callback && callback()
			})
		} else {
			const suggestVersions = (input) => {
				const versions = object.versions.filter(cli => cli.slice(0, input.length) === input)
				return Promise.resolve(versions.map(cli => ({title: cli, value: cli})))
			}

			autocompletePrompt('Which version do you want to remove?', suggestVersions)
			.on('submit', (version) => {
				const index = object.versions.indexOf(version)
				if (index >= 0) {
					object.versions.splice(index, 1)

					console.log(`\nSuccessfully removed ${chalk.bold(version)} from ${chalk.bold(cliname)}`)

					if (object.version == index) {
						object.version = 0
						createSimlink(object.versions[0], cliname)
						console.log(`Switched ${cliname} from ${chalk.bold(version)} to ${chalk.bold(object.versions[0])}`)
					}

					update(object, () => {
						console.log('')
						callback && callback()
					})
				} else {
					console.log(`\nThis version does not exist!\n`)
				}
			})
		}
	})
}

const showVersion = () => {
	console.log(require('./package.json').version)
}

const showHelp = () => {
	console.log('')
	console.log('CLI Version Manager')
	console.log(' -h  --help             Shows this help screen')
	console.log(' -V  --version          Version of clivm')
	console.log('     add <cli-path>     Add a cli version to clivm')
	console.log(' ls  list <cli-name>    List all versions of a cli')
	console.log(' sw  switch <cli-name>  Switch version of a cli')
	console.log(' rm  remove <cli-name>  Remove version of a cli')
	console.log('')
}

const update = (object, callback) => {
	store.remove(object.id, (err) => {
		if (err) throw err
		store.add(object, (err) => {
			if (err) throw err
			callback && callback()
		})
	})
}

const argv = process.argv.slice(2)
const argvContains = (arg) => argv.indexOf(arg) >= 0

if (argvContains('list') || argvContains('ls')) {
	if (argv.length === 2) {
    list(argv[1])
  } else {
    list('all')
  }
} else if (argvContains('switch') || argvContains('sw')) {
	if (argv.length === 2) {
		change(argv[1])
	} else {
		showHelp()
	}
} else if (argvContains('add')) {
	if (argv.length === 2) {
		add(argv[1])
	} else {
		showHelp()
	}
} else if (argvContains('remove') || argvContains('rm')) {
	if (argv.length === 2) {
		remove(argv[1])
	} else {
		showHelp()
	}
} else if (argvContains('-v') || argvContains('--version')) {
	showVersion()
} else if (argvContains('-h') || argvContains('--help')) {
	showHelp()
} else {
	showHelp()
}
