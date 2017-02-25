'use strict'
var log = require('npmlog')

module.exports = process

var timings = {}

process.on('time', function (name) {
  timings[name] = Date.now()
})

process.on('timeEnd', function (name) {
  if (name in timings) {
    process.emit('timing', name, Date.now() - timings[name])
    delete timings[name]
  } else {
    log.silly('timing', "Tried to end timer that doesn't exist:", name)
    return
  }
})
