#!/usr/bin/env node
// yarn publish all packages with same version
// create a git commit and tag it
const { promisify } = require('util');
const fs = require('fs');
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const { exec } = require('child_process');
const path = require('path');

const ROOT_DIR = __dirname;
const PACKAGES_DIR = path.join(ROOT_DIR, 'packages');
const rootPkg = require('./package.json');
const semver = [ 'major', 'minor', 'patch' ];
const pkgPrefix = '@shlim/';

// json file operations
function writeJSON(filepath, data) {
  return new Promise((resolve, reject) => {
    const json = JSON.stringify(data, null, 2);
    fs.writeFile(filepath, json, 'utf8', (ex) => ex ? reject(ex) : resolve());
  });
}
function readJSON(filepath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filepath, 'utf8', (ex, data) => ex ? reject(ex) : resolve(JSON.parse(data)));
  });
}

// Executes a shell command
function shell(cmd, package) {
  return new Promise((resolve, reject) => {
    const cwd = package ? path.join(PACKAGES_DIR, package) : ROOT_DIR;
    exec(cmd, { cwd, encoding: 'utf-8' }, ex => ex ? reject(ex) : resolve());
  });
}

// Bumps the version from the root package
function bumpVersion(tag) {
  const idx = semver.indexOf(tag);
  const version = rootPkg.version.split('.').map(Number);
  // We need fallthrough
  switch(idx) {
    case 0:
      version[0] += 1;
    case 1:
      version[1] = idx == 1 ? version[1] + 1 : 0;
    case 2:
      version[2] = idx == 2 ? version[2] + 1 : 0;
      break;
    default:
      throw new Error('Version tag not recognised');
  }
  return version.join('.');
}

// Assures that all linked dependencies gets bumped too
async function bumpDependencies(pkg, version) {
  const keys = [ 'dependencies', 'peerDependencies', 'devDependencies'];

  for (const key of keys) {
    const deps = pkg[key];
    if (!deps) continue;

    for (const dep of Object.keys(deps)) {
      if (dep.startsWith(pkgPrefix)) {
        deps[dep] = `^${version}`;
      }
    }
  }

  const package = pkg.name.split('/')[1];
  await writeJSON(path.join(PACKAGES_DIR, package, 'package.json'), pkg);
}

// Program entrypoint
async function main() {
  const tag = process.argv[2];
  const version = bumpVersion(tag);
  const packages = await readdir(PACKAGES_DIR);

  // Do yarn publish on all packages individually
  // This assumes prepublish script hook for rebuilding the typescript sources
  console.log(`Next version v${version}`);
  for (const package of packages) {
    const dir = path.join(PACKAGES_DIR, package);
    const stats = await stat(dir);

    // Only publish directories with package.json set to public
    if (stats.isDirectory()) {
      const pkg = await readJSON(path.join(dir, 'package.json'));

      if (pkg.private !== true) {
        console.log(`Publishing package ${package}`);
        await bumpDependencies(pkg, version);
        await shell(`yarn publish --new-version ${version} --no-git-tag-version --access public`, package);
      }
    }
  }

  // Update version in root package
  rootPkg.version = version;
  await writeJSON(path.join(ROOT_DIR, 'package.json'), rootPkg);

  // Create a commit with a release tag
  await shell(`git commit -am v${version}`);
  await shell(`git tag -a v${version} -m v${version}`);
}

main().catch(console.error);
