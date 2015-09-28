require('dotenv').load();

var tumblr      = require('tumblr.js'),
    async       = require('async'),
    cloudinary  = require('cloudinary'),
    pathToKeystoneInstall = "/Users/sartois/Documents/PersonalWork/ContrePensees",
    keystone = require(pathToKeystoneInstall + '/node_modules/keystone'),
    mongoose = require(pathToKeystoneInstall + '/node_modules/keystone/node_modules/mongoose/index');

var tumblrSiteUrl      = process.env.TUMBLR_URL,
    postFunctionFormat =  "handle[POST-TYPE]Post",
    authorEmail        = process.env.AUTHOR_EMAIL,
    queryParams        = {
        offset: 3,
        limit: 50,
        type:'photo'
    },
    client = tumblr.createClient({
        consumer_key: process.env.TUMBLR_KEY
    });

keystone.init({
    'user model': 'User',
    'cookie secret': process.env.COOKIE_SECRET,
    'cloudinary config': process.env.CLOUDINARY_URL
});
keystone.import('../ContrePensees/models');

cloudinary.config({
    cloud_name: 'contre-pensees',
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

var lib     = require('./lib/common')(cloudinary),
    adapter = require('./lib/tumblrAdapater')(keystone.list('Post'), cloudinary, lib),
    User    = keystone.list('User');

mongoose.connect('localhost', 'contre-pensees');
var db = mongoose.connection;
db.on('error', function() {
    console.error('connection error:', arguments);
    process.exit(2);
});

db.once('open', function() {
    async.waterfall([
        //Get author
        function(callback) {
            User.model.findOne()
                .where('email', authorEmail)
                .exec()
                .then(function(user) {
                    if (user === null) {
                        callback("User not found");
                    } else {

                        callback(null, user);
                    }
                }, callback);
        },
        //Launch Tumblr query
        function(user, callback) {

            client.posts(
                tumblrSiteUrl,
                queryParams,
                function(err, data) {
                    if (err || ! data) {
                        callback(err ? err : "Can't find any post");
                    } else {
                        callback(null, data, user);
                    }
                }
            );
        },
        //Parse tumblr data and populate a post array
        async.apply(handleTumblrPost),
        //Save post to db
        function(posts, waterfallCallback) {
            async.each(posts, function(post, callback) {

                if (! "save" in post) {
                    console.error(post);
                    callback("No save method");
                    return;
                }

                console.log("Save post " + post.key);
                post.save(callback);

            }, function(err) {
                if (err) {
                    waterfallCallback(err);
                } else {
                    waterfallCallback(null);
                }
            });
        }
    ], function(err) {
        if (err) {
            console.error(err);
            process.exit(1);
        } else {
            console.log("Success");
            process.exit(0);
        }
    });
});

/**
 * @param {Object} data JSON Tumblr api answer
 * @param {Object} author User keystone document
 * @param {Fucntion} callback Async waterfall callback
 */
function handleTumblrPost(data, author, callback) {

    var postsToSave = [];

    async.forEachOfSeries(
        data.posts,
        function(tpost, i, postCallback) {
            if (tpost.state === 'published') {
                console.log("Fetch tumblr data");
                var handlePostCallbackName = postFunctionFormat.replace(
                    "[POST-TYPE]",
                    lib.ucFirst(tpost.type)
                );
                adapter[handlePostCallbackName](tpost, author, postCallback, postsToSave);
            } else {
                console.log("Not published", i, tpost.body);
                postCallback();
            }
        },
        function(err) {
            if (err) {
                callback(err);
            } else {
                callback(null, postsToSave);
            }
        }
    );
};
