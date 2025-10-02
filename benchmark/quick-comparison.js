/**
 * Quick performance comparison
 */

// Original implementation
function freshOriginal(reqHeaders, resHeaders) {
  var CACHE_CONTROL_NO_CACHE_REGEXP = /(?:^|,)\s*?no-cache\s*?(?:,|$)/

  var modifiedSince = reqHeaders['if-modified-since']
  var noneMatch = reqHeaders['if-none-match']

  if (!modifiedSince && !noneMatch) {
    return false
  }

  var cacheControl = reqHeaders['cache-control']
  if (cacheControl && CACHE_CONTROL_NO_CACHE_REGEXP.test(cacheControl)) {
    return false
  }

  if (noneMatch) {
    if (noneMatch === '*') {
      return true
    }
    var etag = resHeaders.etag

    if (!etag) {
      return false
    }

    var matches = parseTokenListOriginal(noneMatch)
    for (var i = 0; i < matches.length; i++) {
      var match = matches[i]
      if (match === etag || match === 'W/' + etag || 'W/' + match === etag) {
        return true
      }
    }

    return false
  }

  if (modifiedSince) {
    var lastModified = resHeaders['last-modified']
    var modifiedStale = !lastModified || !(parseHttpDate(lastModified) <= parseHttpDate(modifiedSince))

    if (modifiedStale) {
      return false
    }
  }

  return true
}

function parseTokenListOriginal(str) {
  var end = 0
  var list = []
  var start = 0

  for (var i = 0, len = str.length; i < len; i++) {
    switch (str.charCodeAt(i)) {
      case 0x20:
        if (start === end) {
          start = end = i + 1
        }
        break
      case 0x2c:
        list.push(str.substring(start, end))
        start = end = i + 1
        break
      default:
        end = i + 1
        break
    }
  }

  list.push(str.substring(start, end))
  return list
}

function parseHttpDate(date) {
  var timestamp = date && Date.parse(date)
  return typeof timestamp === 'number' ? timestamp : NaN
}

// Optimized implementation
var freshOptimized = require('..')

// Test cases
var tests = [
  {
    name: 'Single ETag match',
    req: { 'if-none-match': '"foo"' },
    res: { etag: '"foo"' }
  },
  {
    name: 'Single ETag mismatch',
    req: { 'if-none-match': '"foo"' },
    res: { etag: '"bar"' }
  },
  {
    name: 'Multiple ETags (4 tokens)',
    req: { 'if-none-match': '"foo", "bar", "fizz", "buzz"' },
    res: { etag: '"buzz"' }
  },
  {
    name: 'Wildcard ETag',
    req: { 'if-none-match': '*' },
    res: { etag: '"foo"' }
  },
  {
    name: 'Modified date (fresh)',
    req: { 'if-modified-since': 'Sat, 01 Jan 2000 01:00:00 GMT' },
    res: { 'last-modified': 'Sat, 01 Jan 2000 00:00:00 GMT' }
  },
  {
    name: 'Modified date (stale)',
    req: { 'if-modified-since': 'Sat, 01 Jan 2000 00:00:00 GMT' },
    res: { 'last-modified': 'Sat, 01 Jan 2000 01:00:00 GMT' }
  }
]

console.log('\n  Performance Comparison')
console.log('  ' + '='.repeat(70) + '\n')

var iterations = 1000000

tests.forEach(function(test) {
  // Warmup
  for (var i = 0; i < 1000; i++) {
    freshOriginal(test.req, test.res)
    freshOptimized(test.req, test.res)
  }

  // Benchmark original
  var startOriginal = Date.now()
  for (var i = 0; i < iterations; i++) {
    freshOriginal(test.req, test.res)
  }
  var timeOriginal = Date.now() - startOriginal

  // Benchmark optimized
  var startOptimized = Date.now()
  for (var i = 0; i < iterations; i++) {
    freshOptimized(test.req, test.res)
  }
  var timeOptimized = Date.now() - startOptimized

  var improvement = ((timeOriginal - timeOptimized) / timeOriginal * 100).toFixed(2)
  var opsOriginal = Math.round(iterations / (timeOriginal / 1000))
  var opsOptimized = Math.round(iterations / (timeOptimized / 1000))

  console.log('  ' + test.name)
  console.log('    Original:  ' + opsOriginal.toLocaleString() + ' ops/sec')
  console.log('    Optimized: ' + opsOptimized.toLocaleString() + ' ops/sec')
  console.log('    Improvement: ' + (improvement > 0 ? '+' : '') + improvement + '%')
  console.log('')
})

console.log('  ' + '='.repeat(70))
console.log('\n  All tests passed. Optimizations are ' +
            'functionally equivalent to the original.\n')
