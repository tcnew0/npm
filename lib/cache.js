'use strict'

const BB = require('bluebird')

const assert = require('assert')
const cacache = require('cacache')
const log = require('npmlog')
const npm = require('./npm.js')
const output = require('./utils/output.js')
const pacote = require('pacote')
const pacoteOpts = require('./config/pacote')
const path = require('path')
const rm = BB.promisify(require('./utils/gently-rm.js'))
const unbuild = BB.promisify(npm.commands.unbuild)

cache.usage = 'npm cache add <tarball file>' +
              '\nnpm cache add <folder>' +
              '\nnpm cache add <tarball url>' +
              '\nnpm cache add <git url>' +
              '\nnpm cache add <name>@<version>' +
              '\nnpm cache ls [<path>]' +
              '\nnpm cache clean [<pkg>[@<version>]]'

cache.completion = function (opts, cb) {
  var argv = opts.conf.argv.remain
  if (argv.length === 2) {
    return cb(null, ['add', 'ls', 'clean'])
  }

  // TODO - eventually...
  switch (argv[2]) {
    case 'clean':
    case 'ls':
    case 'add':
      return cb(null, [])
  }
}

exports = module.exports = cache
function cache (args, cb) {
  const cmd = args.shift()
  let result
  switch (cmd) {
    case 'rm': case 'clear': case 'clean':
      result = clean(args)
      break
    case 'list': case 'sl': case 'ls':
      result = ls(args)
      break
    case 'add':
      result = add(args, npm.prefix)
      break
    default: return cb('Usage: ' + cache.usage)
  }
  if (!result || !result.then) {
    throw new Error(`npm cache ${cmd} handler did not return a Promise`)
  }
  result.then(() => cb(), cb)
}

// npm cache ls [pkg]*
function ls (args) {
  const cache = path.join(npm.config.get('cache'), '_cacache')
  let prefix = cache
  if (prefix.indexOf(process.env.HOME) === 0) {
    prefix = '~' + prefix.substr(process.env.HOME.length)
  }
  // TODO - put headers/metadata in cache entries so we can do this better
  const entries = cacache.ls.stream(cache)
  entries.on('data', (entry) => {
    const ctype = entry.metadata && entry.metadata.resHeaders && entry.metadata.resHeaders['content-type']
    if (
      ctype &&
      ctype.join(',').match(/application\/(?:json|vnd.npm.install)/)
    ) {
      output(`${entry.key.replace(/make-fetch-happen:request-cache:/, '')}`)
    }
  })
  return BB.fromNode((cb) => {
    entries.on('error', cb)
    entries.on('end', cb)
  })
}

// npm cache clean [<path>]
cache.clean = clean
function clean (args) {
  if (!args) args = []
  // TODO - remove specific packages or package versions
  return rm(path.join(npm.cache, '_cacache'))
}

// npm cache add <tarball-url>
// npm cache add <pkg> <ver>
// npm cache add <tarball>
// npm cache add <folder>
cache.add = function (pkg, ver, where, scrub) {
  assert(typeof pkg === 'string', 'must include name of package to install')
  if (scrub) {
    return clean([]).then(() => {
      return add([pkg, ver], where)
    })
  }
  return add([pkg, ver], where)
}

function add (args, where) {
  var usage = 'Usage:\n' +
              '    npm cache add <tarball-url>\n' +
              '    npm cache add <pkg>@<ver>\n' +
              '    npm cache add <tarball>\n' +
              '    npm cache add <folder>\n'
  var spec
  log.silly('cache add', 'args', args)
  if (args[1] === undefined) args[1] = null
  // at this point the args length must ==2
  if (args[1] !== null) {
    spec = args[0] + '@' + args[1]
  } else if (args.length === 2) {
    spec = args[0]
  }
  log.verbose('cache add', 'spec', spec)
  if (!spec) return BB.reject(new Error(usage))
  log.silly('cache add', 'parsed spec', spec)
  return pacote.prefetch(spec, pacoteOpts({where}))
}

cache.unpack = unpack
function unpack (pkg, ver, unpackTarget, dmode, fmode, uid, gid) {
  return unbuild([unpackTarget], true).then(() => {
    const opts = pacoteOpts({dmode, fmode, uid, gid, offline: true})
    return pacote.extract(`${pkg}@${ver}`, unpackTarget, opts)
  })
}
