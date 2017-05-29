'use strict'

const homedir = require('os').homedir()
const exec = require('child_process').exec
const path = require('path')
const fs = require('fs')

const clivmHome = path.join(homedir, '.clivm')
const clivmBin = path.join(clivmHome, 'bin')

const patch = (patch, profile) => {
	fs.readFile(profile, 'utf8', (err, data) => {
		if (err) {
			return
		}
		if (data.indexOf(patch) >= 0) {
			console.log(`${profile} already patched.`)
			return
		}
		fs.writeFile(profile, data + patch, (err) => {
			if (err) {
				return console.log(err)
			}
			console.log(`${profile} sucessfully patched.`)
		})
	})
	exec('source ' + profile)
}

const patchBash = () => {
	const patchData = `\n# CLI Version Manager\nexport PATH=${clivmBin}:$PATH\n`
	const profilePath = path.join(homedir, '.bash_profile')
	patch(patchData, profilePath)
}

const patchFish = () => {
	const patchData = `\n# CLI Version Manager\nset -gx PATH ${clivmBin} $PATH\n`
	const profilePath = path.join(homedir, '.config/fish/config.fish')
	patch(patchData, profilePath)
}

exec('mkdir -p ' + clivmBin)

patchBash()
patchFish()