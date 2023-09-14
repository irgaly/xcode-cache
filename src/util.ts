import * as core from '@actions/core'
import * as fs from 'fs/promises'
import { existsSync } from 'fs'
import * as path from 'path'
import { createReadStream } from 'fs'
import * as exec from '@actions/exec'
import { ExecOptions } from '@actions/exec'
import * as crypto from 'crypto'
import { pipeline } from 'stream/promises'

/**
 * BigInt to time string "1694535491.104939637"
 */
export function getTimeString(
  value: BigInt
): string {
  let str = value.toString()
  return `${str.slice(0, str.length - 9)}.${str.slice(str.length - 9)}`
}

/**
 * Get SHA256 hash from file content
 */
export async function calculateHash(
  targetPath: string
): Promise<string> {
  const hash = crypto.createHash('sha256')
  await pipeline(createReadStream(targetPath), hash)
  return hash.digest('hex')
}

/**
 * Get SHA256 hash from directory entities
 *
 * directory hash:
 *   * children's fileName
 */
export async function calculateDirectoryHash(
  targetPath: string
): Promise<string> {
  const hash = crypto.createHash('sha256')
  const fileNames = (await fs.readdir(targetPath)).sort()
  for(const fileName of fileNames) {
    hash.update(fileName)
  }
  return hash.digest('hex')
}

/**
 * return true if the child path is under the parent path in UNIX file system.
 */
export function pathContains(parent: string, child: string): boolean {
  return !path.relative(parent, child).startsWith("../")
}

export async function execute(
  command: string, args: string[] = [], cwd?: string
): Promise<string> {
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

export async function fakeCache(
  cache: any
) {
  Object.assign(cache, {
    restoreCache: async (paths: string[], primaryKey: string, restoreKeys?: string[]): Promise<string | undefined> => {
      if (existsSync(paths[0])) {
        core.info(`Debug: restoreCache success: ${paths[0]}`)
        return "restore-key"
      } else {
        core.error(`Debug: restoreCache failure: ${paths[0]}`)
        return undefined
      }
    },
    saveCache: async (paths: string[], key: string): Promise<number> => {
      if (existsSync(paths[0])) {
        core.info(`Debug: saveCache success: ${paths[0]}`)
        return 0
      } else {
        core.error(`Debug: saveCache failure: ${paths[0]}`)
        throw new Error(`file not exist: ${paths[0]}`)
      }
    }
  })
}
