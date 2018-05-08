var fs = require('fs');
var gm = require('gm');

var run = require('./assets/run');
var getMockList = require('./assets/get_mock_list');
var getImagePaths = require('./assets/get_image_paths');
var common = require('../../tasks/util/common');

var argv = require('minimist')(process.argv.slice(2), {
    'boolean': ['queue', 'help', 'debug'],
    'string': ['parallel-limit', 'threshold'],
    'alias': {
        help: ['h', 'info']
    },
    'default': {
        threshold: 0.0001,
        'parallel-limit': 4
    }
});

if(argv.help) {
    console.log([
        'Image pixel comparison test script.',
        '',
        'CLI arguments:',
        '',
        '1. \'pattern\' : glob(s) determining which mock(s) are to be tested',
        '2. --queue : if sent, the image will be run in queue instead of in batch.',
        '    Makes the test run significantly longer, but is recommended on weak hardware.',
        '',
        'Examples:',
        '',
        'Run all tests in batch:',
        '',
        '   npm run test-image',
        '',
        'Run the \'contour_nolines\' test:',
        '',
        '   npm run test-image -- contour_nolines',
        '',
        'Run all gl3d image test in queue:',
        '',
        '   npm run test-image -- gl3d_* --queue',
        '',
        'Run all image tests except gl3d and pie (N.B. need to escape special characters):',
        '',
        '   npm run baseline -- "\!\(gl3d_*\|pie_*\)"',
        ''
    ].join('\n'));
    process.exit(0);
}

var mockList = getMockList(argv._);

// filter out untestable mocks if no input is specified
if(argv._.length === 0) {
    console.log('Filtering out untestable mocks:');
    mockList = mockList.filter(untestableFilter);
    console.log('\n');
}

// gl2d have limited image-test support
if(argv._.indexOf('gl2d_*') !== -1) {
    if(!argv.queue) {
        console.log('WARN: Running gl2d image tests in batch may lead to unwanted results\n');
    }
    console.log('Sorting gl2d mocks to avoid gl-shader conflicts');
    sortGl2dMockList(mockList);
    console.log('');
}

var input = mockList.map(function(m) { return getImagePaths(m).mock; });

run(mockList, input, argv, function write(info, done) {
    var mockName = mockList[info.itemIndex];
    var paths = getImagePaths(mockName);
    var imgData = info.body;

    if(!common.doesFileExist(paths.baseline)) {
        return done(mockName + ': baseline image for does not exist');
    }

    fs.writeFile(paths.test, imgData, function(err) {
        if(err) {
            return done(mockName + ': error during test image generation');
        }

        gm.compare(paths.test, paths.baseline, {
            file: paths.diff,
            highlightColor: 'purple',
            tolerance: argv.threshold
        }, function(err, isEqual, equality) {
            if(err) {
                return done(mockName + ': gm compare error');
            }

            if(isEqual) {
                fs.unlink(paths.diff, function(err) {
                    if(err) {
                        return done(mockName + ': unlink error');
                    }
                    done();
                });
            } else {
                done('differs by ' + (equality / argv.threshold).toPrecision(4) + ' times the threshold');
            }
        });
    });
});

/* Test cases:
 *
 * - font-wishlist
 * - all gl2d
 * - all mapbox
 *
 * don't behave consistently from run-to-run and/or
 * machine-to-machine; skip over them for now.
 *
 */
function untestableFilter(mockName) {
    var cond = !(
        mockName === 'font-wishlist' ||
        mockName.indexOf('gl2d_') !== -1 ||
        mockName.indexOf('mapbox_') !== -1
    );

    if(!cond) console.log(' -', mockName);

    return cond;
}

/* gl2d pointcloud and other non-regl gl2d mock(s)
 * must be tested first on in order to work;
 * sort them here.
 *
 * gl-shader appears to conflict with regl.
 * We suspect that the lone gl context on CircleCI is
 * having issues with dealing with the two different
 * program binding algorithm.
 *
 * The problem will be solved by switching all our
 * WebGL-based trace types to regl.
 *
 * More info here:
 * https://github.com/plotly/plotly.js/pull/1037
 */
function sortGl2dMockList(mockList) {
    var mockNames = ['gl2d_pointcloud-basic', 'gl2d_heatmapgl'];
    var pos = 0;

    mockNames.forEach(function(m) {
        var ind = mockList.indexOf(m);
        var tmp = mockList[pos];
        mockList[pos] = m;
        mockList[ind] = tmp;
        pos++;
    });
}
