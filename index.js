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
const so = require('so')

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

const suggestVersions = (versions) => (input) => {
	const results = versions.filter(version => version.slice(0, input.length) === input)
	return Promise.resolve(results.map(version => ({title: version, value: version})))
}

const suggestCLIs = (clis) => (input) => {
	const results = clis.filter((cli) => cli.slice(0, input.length) === input)
	if (!results.includes(input)) results.push(input)
	return Promise.resolve(results.map((title) => ({title, value: title})))
}

const removeSimlink = so(function* (cliname) {
	try {
		yield fs.unlink(path.join(appBin, cliname))
	} catch (err) {
		if (err.code !== 'ENOENT') throw err 
	}
})

const createSimlink = so(function* (version, cliname) {
	yield mkdirp(appBin)
	yield removeSimlink(cliname)
	yield fs.symlink(version, path.join(appBin, cliname))
})

const update = so(function* (object) {
	yield thenify(store.remove)(object.id)
	yield thenify(store.add)(object)
})

const list = so(function* (cliname) {
	const objects = yield thenify(store.list)()
	
	let entryFound = false

	process.stdout.write('\n')
	for (let cli of objects) {
		if (cliname === cli.id || cliname === 'all') {
			entryFound = true
			process.stdout.write(chalk.blue(cli.id) + '\n')
			for (let index in cli.versions) {
				if (cli.version == index) {
					process.stdout.write(` ${bullet} ${(Number(index) + 1)}: ${cli.versions[index]}\n`)
				}
				else {
					process.stdout.write(`   ${(Number(index) + 1)}: ${cli.versions[index]}\n`)
				}
			}
			process.stdout.write('\n')
		}
	}

	if (!entryFound) {
		if (cliname === 'all') {
			process.stdout.write('No entries found\n')
		} else {
			process.stdout.write('No entries found for ' + cliname + '\n')
		}
	}
})

const change = so(function* (cliname) {
	const object = yield thenify(store.load)(cliname)
	const version = yield prompt(`To which ${chalk.bold(cliname)} version do you want to switch?`, suggestVersions(object.versions), object.version)
	const index = object.versions.indexOf(version)
	if (index >= 0) {
		yield update(Object.assign(object, {version: index}))
		yield createSimlink(version, cliname)
		return `Successfully switched ${chalk.bold(cliname)} to version ${chalk.bold(version)}\n`
	} else {
		throw new Error('This version does not exist!')
	}
})

const add = so(function* (version) {
	const objects = yield thenify(store.list)()
	const cliname = yield prompt('To which CLI do you want to add this version?', suggestCLIs(objects.map((cli) => cli.id)))
	const index = objects.map((obj) => obj.id).indexOf(cliname)
	if (index >= 0) {
		objects[index].versions.push(version)
		yield update(objects[index])
		return `Added ${chalk.bold(version)} to ${chalk.bold(cliname)}\n`
	} else {
		const cli = {'id': cliname, 'version': 0, 'versions': [version]}
		yield thenify(store.add)(cli)
		yield createSimlink(version, cliname)
		return `Created ${chalk.bold(cliname)} with version ${chalk.bold(version)}\n`
	}
})

const remove = so(function* (cliname) {
	const object = yield thenify(store.load)(cliname)
	if (object.versions.length === 1) {
		yield thenify(store.remove)(cliname)
		yield removeSimlink(cliname)
		return `Successfully removed ${chalk.bold(cliname)} from CLI Version Manager\n`
	} else {
		const version = yield prompt('Which version do you want to remove?', suggestVersions(object.versions))
		const index = object.versions.indexOf(version)
		if (index >= 0) {
			object.versions.splice(index, 1)

			process.stdout.write(`Successfully removed ${chalk.bold(version)} from ${chalk.bold(cliname)}\n`)

			if (object.version == index) {
				object.version = 0
				yield createSimlink(object.versions[0], cliname)
				yield update(object)
				return `Switched ${cliname} from ${chalk.bold(version)} to ${chalk.bold(object.versions[0])}\n`
			} else {
				return update(object)
			}

		} else {
			throw new Error('This version does not exist!')
		}
	}
})

const showVersion = () => {
	process.stdout.write(pkg.version + '\n')
}

const showHelp = () => {
	process.stdout.write(chalk.cyan('\nCLI Version Manager\n'))
	process.stdout.write(chalk.cyan(' -h  --help         ') + 'Shows this help screen\n')
	process.stdout.write(chalk.cyan(' -V  --version      ') + 'Version of clivm\n')
	process.stdout.write(chalk.cyan('     add ') + chalk.white('<path> ') + '    Add a cli version to clivm\n')
	process.stdout.write(chalk.cyan(' ls  list ') + chalk.white('[name] ') + '   List all versions of a cli\n')
	process.stdout.write(chalk.cyan(' sw  switch ') + chalk.white('<name> ') + ' Switch version of a cli\n')
	process.stdout.write(chalk.cyan(' rm  remove ') + chalk.white('<name> ') + ' Remove version of a cli\n\n')
	process.stdout.write('')
}

const call = so(function *(task) {
	try {
		const res = yield task
		if (res) process.stdout.write(res)
	} catch (err) {
		process.stderr.write(err)
		process.exit(1)
	}
})

const launch = (argv) => {
	if (argv.includes('list') || argv.includes('ls')) {
		call(list(argv[1] || 'all'))
	} else if (argv.includes('switch') || argv.includes('sw')) {
		if (argv[1]) call(change(argv[1]))
		else showHelp()
	} else if (argv.includes('add')) {
		if (argv[1]) call(add(argv[1]))
		else showHelp()
	} else if (argv.includes('remove') || argv.includes('rm')) {
		if (argv[1]) call(remove(argv[1]))
		else showHelp()
	} else if (argv.includes('-v') || argv.includes('--version')) {
		showVersion()
	} else if (argv.includes('-h') || argv.includes('--help')) {
		showHelp()
	} else if (argv.length > 0) {
		process.stderr.write(chalk.red(`\nUnrecognized command.\n`))
		showHelp()
		process.exit(1)
	} else {
		showHelp()
	}
}

launch(process.argv.slice(2))
