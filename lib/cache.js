'use strict'

const pacote = require('pacote')
const pacoteOpts = require('./config/pacote')
const cacache = require('cacache')
var npm = require('./npm.js')
var assert = require('assert')
var rm = require('./utils/gently-rm.js')
var log = require('npmlog')
var path = require('path')
var tar = require('./utils/tar.js')
var realizePackageSpecifier = require('realize-package-specifier')
var mapToRegistry = require('./utils/map-to-registry.js')
var output = require('./utils/output.js')

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

cache.unpack = unpack
cache.clean = clean

exports = module.exports = cache
function cache (args, cb) {
  var cmd = args.shift()
  switch (cmd) {
    case 'rm': case 'clear': case 'clean': return clean(args, cb)
    case 'list': case 'sl': case 'ls': return ls(args, cb)
    case 'add': return add(args, npm.prefix, cb)
    default: return cb('Usage: ' + cache.usage)
  }
}

// npm cache ls [pkg]*
function ls (args, cb) {
  const cache = path.join(npm.config.get('cache'), '_cacache')
  let prefix = cache
  if (prefix.indexOf(process.env.HOME) === 0) {
    prefix = '~' + prefix.substr(process.env.HOME.length)
  }
  // TODO - put headers/metadata in cache entries so we can do this better
  const entries = cacache.ls.stream(cache)
  entries.on('data', entry => {
    const ctype = entry.metadata && entry.metadata.resHeaders && entry.metadata.resHeaders['content-type']
    if (
      ctype &&
      ctype.join(',').match(/application\/(?:json|vnd.npm.install)/)
    ) {
      output(`${entry.key.replace(/make-fetch-happen:request-cache:/, '')} - ${
        path.join(
          prefix,
          path.relative(cache, entry.path)
        )}`)
    }
  })
  entries.on('error', cb)
  entries.on('end', cb)
}

// npm cache clean [<path>]
function clean (args, cb) {
  assert(typeof cb === 'function', 'must include callback')

  if (!args) args = []

  var f = npm.cache
  // TODO - lol stop blowing away the whole thing. It should make sure that
  // when users clear a package, its cached http responses are also cleared
  // out. This is likely what users *intend* when they ask to rm a specific
  // entry. Might even be nice to add some functionality in there to filter by
  // registry, delete any entries larger than <size>, etc.
  rm(f, cb)
}

// npm cache add <tarball-url>
// npm cache add <pkg> <ver>
// npm cache add <tarball>
// npm cache add <folder>
cache.add = function (pkg, ver, where, scrub, cb) {
  assert(typeof pkg === 'string', 'must include name of package to install')
  assert(typeof cb === 'function', 'must include callback')
  if (scrub) {
    return clean([], function (er) {
      if (er) return cb(er)
      add([pkg, ver], where, cb)
    })
  }
  return add([pkg, ver], where, cb)
}

function add (args, where, cb) {
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
  if (!spec) return cb(usage)
  log.silly('cache add', 'parsed spec', spec)
  const opts = pacoteOpts({where})
  pacote.prefetch(spec, opts).then(() => cb(), cb)
}

function unpack (pkg, ver, unpackTarget, dMode, fMode, uid, gid, cb) {
  if (typeof cb !== 'function') {
    cb = gid
    gid = null
  }
  if (typeof cb !== 'function') {
    cb = uid
    uid = null
  }
  if (typeof cb !== 'function') {
    cb = fMode
    fMode = null
  }
  if (typeof cb !== 'function') {
    cb = dMode
    dMode = null
  }

  read(pkg, ver, false, function (er) {
    if (er) {
      log.error('unpack', 'Could not read data for %s', pkg + '@' + ver)
      return cb(er)
    }
    npm.commands.unbuild([unpackTarget], true, function (er) {
      if (er) return cb(er)
      tar.unpack(
        path.join(cachedPackageRoot({ name: pkg, version: ver }), 'package.tgz'),
        unpackTarget,
        dMode, fMode,
        uid, gid,
        cb
      )
    })
  })
}
