/*!
 * fresh
 * Copyright(c) 2012 TJ Holowaychuk
 * Copyright(c) 2016-2017 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict'

/**
 * RegExp to check for no-cache token in Cache-Control.
 * @private
 */

var CACHE_CONTROL_NO_CACHE_REGEXP = /(?:^|,)\s*?no-cache\s*?(?:,|$)/

/**
 * Module exports.
 * @public
 */

module.exports = fresh

/**
 * Check freshness of the response using request and response headers.
 *
 * @param {Object} reqHeaders
 * @param {Object} resHeaders
 * @return {Boolean}
 * @public
 */

function fresh (reqHeaders, resHeaders) {
  // fields
  var modifiedSince = reqHeaders['if-modified-since']
  var noneMatch = reqHeaders['if-none-match']

  // unconditional request
  if (!modifiedSince && !noneMatch) {
    return false
  }

  // Always return stale when Cache-Control: no-cache
  // to support end-to-end reload requests
  // https://tools.ietf.org/html/rfc2616#section-14.9.4
  var cacheControl = reqHeaders['cache-control']
  if (cacheControl && CACHE_CONTROL_NO_CACHE_REGEXP.test(cacheControl)) {
    return false
  }

  // if-none-match takes precedent over if-modified-since
  if (noneMatch) {
    // Fast path: handle wildcard
    if (noneMatch === '*') {
      return true
    }

    var etag = resHeaders.etag
    if (!etag) {
      return false
    }

    // Fast path: check for exact match before parsing
    // This handles the common single ETag case efficiently
    if (noneMatch === etag || noneMatch === 'W/' + etag || 'W/' + noneMatch === etag) {
      return true
    }

    // Fast path: check if it's a simple quoted string (most common case)
    // If there's no comma, we know it's a single token
    if (noneMatch.indexOf(',') === -1) {
      // Already checked exact match above, so if no comma, it's a mismatch
      return false
    }

    // Slow path: parse multiple ETags
    var matches = parseTokenList(noneMatch)
    for (var i = 0; i < matches.length; i++) {
      var match = matches[i]
      if (match === etag || match === 'W/' + etag || 'W/' + match === etag) {
        return true
      }
    }

    return false
  }

  // if-modified-since
  if (modifiedSince) {
    var lastModified = resHeaders['last-modified']

    // Early exit: missing last-modified means stale
    if (!lastModified) {
      return false
    }

    // Parse dates once and compare
    var lastModifiedTime = parseHttpDate(lastModified)
    var modifiedSinceTime = parseHttpDate(modifiedSince)

    // If either date is invalid (NaN), it's stale
    // If resource is newer (lastModified > modifiedSince), it's stale
    if (isNaN(lastModifiedTime) || isNaN(modifiedSinceTime) || lastModifiedTime > modifiedSinceTime) {
      return false
    }
  }

  return true
}

/**
 * Parse an HTTP Date into a number.
 *
 * @param {string} date
 * @private
 */

function parseHttpDate (date) {
  var timestamp = date && Date.parse(date)

  // istanbul ignore next: guard against date.js Date.parse patching
  return typeof timestamp === 'number'
    ? timestamp
    : NaN
}

/**
 * Parse a HTTP token list.
 *
 * @param {string} str
 * @private
 */

function parseTokenList (str) {
  var end = 0
  var list = []
  var start = 0
  var len = str.length

  // gather tokens
  for (var i = 0; i < len; i++) {
    var code = str.charCodeAt(i)
    if (code === 0x20) { /*   */
      if (start === end) {
        start = end = i + 1
      }
    } else if (code === 0x2c) { /* , */
      if (end > start) {
        list.push(str.substring(start, end))
      }
      start = end = i + 1
    } else {
      end = i + 1
    }
  }

  // final token
  if (end > start) {
    list.push(str.substring(start, end))
  }

  return list
}
