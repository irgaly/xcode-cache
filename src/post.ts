import * as core from '@actions/core'
import * as cache from '@actions/cache'
import * as glob from '@actions/glob'
import * as exec from '@actions/exec'
import * as fs from 'fs/promises'
import { existsSync } from 'fs'
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
    const sourcePackagesDirectory = await input.getSourcePackagesDirectory()
    if (!existsSync(derivedDataDirectory)) {
      core.warning(`DerivedData directory not found: ${derivedDataDirectory}`)
      core.warning('skipped to storing mtime')
    } else {
      await storeMtime(
        derivedDataDirectory,
        sourcePackagesDirectory,
        input.restoreMtimeTargets,
        input.useDefaultMtimeTargets,
        input.verbose
      )
    }
    if (sourcePackagesDirectory == null) {
      core.info(`SourcePackages directory not found, skip storing SourcePackages`)
    } else {
      if (!existsSync(sourcePackagesDirectory)) {
        core.warning(`SourcePackages directory not found: ${sourcePackagesDirectory}`)
        core.warning('skipped to storing SourcePackages')
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
      sourcePackagesDirectory,
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
  verbose: boolean
) {
  const restoreKey = core.getState('deriveddata-restorekey')
  if (restoreKey == key) {
    core.info(`DerivedData cache has been restored with same key: ${key}, not saving cache`)
  } else {
    const tar = path.join(tempDirectory, 'DerivedData.tar')
    await fs.mkdir(tempDirectory, { recursive: true })
    const parent = path.dirname(derivedDataDirectory)
    let excludes: string[] = []
    let constainsSourcePackages = false
    if (sourcePackagesDirectory != null) {
      if (util.pathContains(derivedDataDirectory, sourcePackagesDirectory)) {
        const relativePath = path.relative(parent, sourcePackagesDirectory)
        excludes = (await fs.readdir(sourcePackagesDirectory)).flatMap (fileName =>
          ['--exclude', `./${path.join(relativePath, fileName)}`]
        )
      }
    }
    let args = ['-cf', tar, ...excludes, '-C', parent, path.basename(derivedDataDirectory)]
    if (verbose) {
      args = ['-v', ...args]
      core.startGroup('Pack DerivedData.tar')
      await exec.exec('tar', ['--version'])
    }
    await exec.exec('tar', args)
    if (verbose) {
      core.endGroup()
    }
    core.info(`DerivedData packed: ${tar}`)
    await cache.saveCache([tar], key)
  }
}

async function storeSourcePackages(
  sourcePackagesDirectory: string,
  tempDirectory: string,
  key: string,
  verbose: boolean
) {
  const restoreKey = core.getState('sourcepackages-restorekey')
  if (restoreKey == key) {
    core.info(`SourcePackages cache has been restored with same key: ${key}, not saving cache`)
  } else {
    const tar = path.join(tempDirectory, 'SourcePackages.tar')
    await fs.mkdir(tempDirectory, { recursive: true })
    let args = ['-cf', tar, '-C', path.dirname(sourcePackagesDirectory), path.basename(sourcePackagesDirectory)]
    if (verbose) {
      args = ['-v', ...args]
      core.startGroup('Pack SourcePackages.tar')
      await exec.exec('tar', ['--version'])
    }
    await exec.exec('tar', args)
    if (verbose) {
      core.endGroup()
    }
    core.info(`SourcePackages packed: ${tar}`)
    try {
      await cache.saveCache([tar], key)
    } catch (error) {
      // in case cache key conflict,
      // this occurs when SourcePackages directory is under DerivedData and
      // DerivedData cache missed.
      // then logging warning and treat as success.
      core.warning(`SourcePackages cache key exists, not saved: ${error}`)
    }
  }
}

async function storeMtime(
  derivedDataDirectory: string,
  sourcePackagesDirectory: string | null,
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
    "**/*.c",
    "**/*.cc",
    "**/*.cpp",
    "**/*.hpp",
    "**/*.hxx"
  ]
  let patterns: string[] = []
  if (useDefaultMtimeTarget) {
    patterns = [...patterns, ...defaultMtimeTargets]
  }
  const targets = restoreMtimeTargets.sort((l, r) => {
    let order = 0
    const excludeL = l.startsWith('!')
    const excludeR = r.startsWith('!')
    if (excludeL != excludeR) {
      if (excludeL) {
        order = 1
      } else {
        order = -1
      }
    }
    return order
  })
  patterns = [...patterns, ...targets]
  patterns = [...patterns, `!${derivedDataDirectory}`]
  if (sourcePackagesDirectory != null) {
    patterns = [...patterns, `!${sourcePackagesDirectory}`]
  }
  if (verbose) {
    core.info(`hash file's glob pattern:\n${patterns.join('\n')}\n`)
  }
  const cwd = process.cwd()
  const globber = await glob.create(patterns.join('\n'))
  const files = (await globber.glob()).map(filePath => {
    return path.relative(cwd, filePath)
  })
  if (verbose) {
    core.startGroup('Stored files')
  }
  for(const path of files) {
    try {
      const stat = await fs.stat(path, {bigint: true})
      const mtime = util.getTimeString(stat.mtimeNs)
      let sha256 = ''
      if (stat.isDirectory()) {
        sha256 = await util.calculateDirectoryHash(path)
      } else {
        sha256 = await util.calculateHash(path)
      }
      if (verbose) {
        core.info(`=> ${mtime} : ${path}`)
      }
      json.push({ path: path, time: mtime, sha256: sha256 })
      stored++
    } catch (error) {
      core.warning(`cannot read file stat: ${path}`)
    }
  }
  if (verbose) {
    core.endGroup()
  }
  await fs.writeFile(jsonFile, JSON.stringify(json))
  core.info(`Stored ${stored} files : ${jsonFile}`)
}
