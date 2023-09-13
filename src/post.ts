import * as core from '@actions/core'
import * as cache from '@actions/cache'
import * as glob from '@actions/glob'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { getInput, debugLocalInput } from './input'
import * as util from './util'
import { MtimeJson } from './json'

post()

async function post() {
  try {
    const debugLocal = await debugLocalInput()
    if (debugLocal) {
      util.fakeCache(cache)
    }
    const runnerOs = process.env['RUNNER_OS']
    if (runnerOs != 'macOS') {
      throw new Error(`host is not macOS: ${runnerOs}`)
    }
    const input = getInput()
    core.info('> inputs')
    Object.entries(input).forEach(([key, value]) => {
      core.info(`${key}: ${value}`)
    })
    core.info('')
    const tempDirectory = path.join(process.env['RUNNER_TEMP']!, 'irgaly-xcode-cache')
    const derivedDataDirectory = await input.getDerivedDataDirectory()
    const derivedDataDirectoryStat = await fs.stat(derivedDataDirectory)
    if (!derivedDataDirectoryStat) {
      core.warn(`DerivedData directory not found: ${derivedDataDirectory}`)
      core.warn('skipped to storing mtime')
    } else {
      await storeMtime(
        derivedDataDirectory,
        input.restoreMtimeTargets,
        input.useDefaultMtimeTarget,
        input.verbose
      )
    }
    const sourcePackagesDirectory = await input.getSourcePackagesDirectory()
    if (sourcePackagesDirectory == null) {
      core.info(`SourcePackages directory not found, skip storing SourcePackages`)
    } else {
      const sourcePackagesDirectoryStat = await fs.stat(sourcePackagesDirectory)
      if (!sourcePackagesDirectoryStat) {
        core.warn(`SourcePackages directory not found: ${sourcePackagesDirectory}`)
        core.warn('skipped to storing SourcePackages')
      } else {
        await storeSourcePackages(
          sourcePackagesDirectory,
          tempDirectory,
          await input.getSwiftpmCacheKey(),
          input.verbose
        )
      }
    }
    await storeDerivedData(
      await input.getDerivedDataDirectory(),
      tempDirectory,
      input.key,
      input.verbose
    )
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    }
  }
}

async function storeDerivedData(
  derivedDataDirectory: string,
  sourcePackagesDirectory: string | null,
  tempDirectory: string,
  key: string,
  restoreKeys: string[]
) {
  const tar = path.join(tempDirectory, 'DerivedData.tar')
  await fs.mkdir(tempDirectory, { recursive: true })
  const parent = path.dirname(derivedDataDirectory)
  let excludes: string[] = []
  let constainsSourcePackages = false
  if (sourcePackagesDirectory != null) {
    if (pathContains(derivedDataDirectory, sourcePackagesDirectory)) {
      const relativePath = path.relative(parent, sourcePackagesDirectory)
      excludes = (await fs.readdir(sourcePackagesDirectory)).flatMap (fileName =>
        ['--exclude', `./${path.join(relativePath, fileName)}`]
      )
    }
  }
  const args = ['-cf', tar, ...excludes, '-C', parent, path.basename(derivedDataDirectory)]
  if (verbose) {
    args = ['-v', ...args]
  }
  core.info(['tar', ...args].join(' '))
  const output = await util.execute('tar', args)
  core.info(output)
  await saveCache(tar, key)
}

async function storeSourcePackages(
  sourcePackagesDirectory: string,
  tempDirectory: string,
  key: string,
  verbose: boolean
) {
  const tar = path.join(tempDirectory, 'SourcePackages.tar')
  await fs.mkdir(tempDirectory, { recursive: true })
  const args = ['-cf', tar, '-C', path.dirname(sourcePackagesDirectory), path.basename(sourcePackagesDirectory)]
  if (verbose) {
    args.push('-v')
  }
  core.info(['tar', ...args].join(' '))
  const output = await util.execute('tar', args)
  core.info(output)
  await saveCache(tar, key)
}

async function storeMtime(
  derivedDataDirectory: string,
  restoreMtimeTargets: string[],
  useDefaultMtimeTarget: boolean,
  verbose: boolean
) {
  let stored = 0
  const jsonFile = path.join(derivedDataDirectory, 'xcode-cache-mtime.json')
  const json: MtimeJson[] = []
  const defaultMtimeTargets = [
    "**/*.swift",
    "**/*.xib",
    "**/*.storyboard",
    "**/*.strings",
    "**/*.plist",
    "**/*.bundle",
    "**/*.bundle/**/*",
    "**/*.bundle/**/*",
    "**/*.m",
    "**/*.mm",
    "**/*.h",
    "**/*.c,
    "**/*.cc,
    "**/*.cpp,
    "**/*.hpp,
    "**/*.hxx
  ]
  const patterns = restoreMtimeTargets
  if (useDefaultMtimeTarget) {
    patterns.push(...defaultMtimeTargets)
  }
  const globber = await glob.create(patterns.join('\n'))
  const files = await globber.glob()
  if (verbose) {
    core.startGroup('Stored files')
  }
  files.forEach(async path => {
    const stat = await fs.stat(path, {bigint: true})
    if (!stat) {
      core.warning(`cannot read file stat: ${path}`)
    } else {
      const mtime = getTimeString(stat.mtimeNs).
      let sha256 = ''
      if (stat.isDirectory()) {
        sha256 = await util.calculateDirectoryHash(path)
      } else {
        sha256 = await util.calculateHash(path)
      }
      if (verbose) {
        core.info(`=> ${mtime} : ${path}`)
      }
      json.push(MtimeJson(path, mtime, sha256))
      stored++
    }
  })
  await fs.writeFile(jsonFile, JSON.stringify(json))
  core.info(`Stored ${stored} files : ${jsonFile}`)
}

async function execute(command: string, args: string[] = [], cwd?: string): Promise<string> {
  let output = ''
  const options: ExecOptions = {}
  options.listeners = {
    stdout: (data: Buffer) => {
      output += data.toString()
    },
    stderr: (data: Buffer) => {
      console.error(data)
    }
  }
  if (cwd) {
    options.cwd = cwd
  }
  await exec.exec(command, args, options)
  return output
}
