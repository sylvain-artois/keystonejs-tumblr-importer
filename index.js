var fs          = require('fs'),
    moment      = require('moment'),
    request     = require('request'),
    tumblr      = require('tumblr.js'),
    cheerio     = require('cheerio'),
    ent         = require('ent'),
    async       = require('async'),
    cloudinary  = require('cloudinary'),
    pathToKeystoneInstall = "/Users/sartois/Documents/PersonalWork/ContrePensees/node_modules",
    keystone = require(pathToKeystoneInstall + '/keystone'),
    mongoose = require(pathToKeystoneInstall + '/keystone/node_modules/mongoose/index');

require('dotenv').load();

var tumblrSiteUrl = process.env.TUMBLR_URL,
    postFunctionFormat =  "handle[POST-TYPE]Post",
    authorEmail = process.env.TUMBLR_URL,
    queryParams = {
        offset: 1,
        limit: 15,
        type:'video'
    },
    client = tumblr.createClient({
        consumer_key: process.env.TUMBLR_KEY
    });

keystone.init({
    'name': 'Contre Pensées',
    'brand': 'Contre Pensées',
    'sass': 'public',
    'static': 'public',
    'favicon': 'public/favicon.ico',
    'views': 'templates/views',
    'view engine': 'html',
    'emails': 'templates/emails',
    'auto update': true,
    'session': true,
    'auth': true,
    'user model': 'User',
    'cookie secret': process.env.COOKIE_SECRET,
    'cloudinary config': process.env.CLOUDINARY_URL
});
keystone.import('../models');

var Post = keystone.list('Post'),
    User = keystone.list('User'),
    Quote = keystone.list('Quote'),
    Gallery = keystone.list('Gallery'),
    Medium = keystone.list('Medium'),
    Photo = keystone.list('Photo');

mongoose.connect('localhost', 'contre-pensees');
var db = mongoose.connection;

cloudinary.config({
    cloud_name: 'contre-pensees',
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

db.on('error', function(){
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
        async.apply(handleTumblrApiResults),
        //Save post to db
        function(posts, waterfallCallback){

            async.each(posts, function(post, callback) {
                if (! "save" in post) {
                    console.error(post);
                    callback("No save method");
                    return;
                }
                console.log("Call save");
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
function handleTumblrApiResults(data, author, callback) {

    var postTosave = [];

    async.forEachOfSeries(
        data.posts,
        function(tpost, i, postcallback) {
            if (tpost.state === 'published') {
                console.log("Fetch tumblr data");
                var handlePostCallbackName = postFunctionFormat.replace(
                    "[POST-TYPE]",
                    capitalizeFirstLetter(tpost.type)
                );
                thandler[handlePostCallbackName](tpost, author, postcallback, postTosave);
            } else {
                console.log("Not published", i, tpost.body);
                postcallback();
            }
        },
        function(err) {
            if (err) {
                callback(err);
            } else {
                callback(null, postTosave);
            }
        }
    );
}

var thandler = {
    /**
     * @param post
     * @param author
     * @param postcallback
     * @param postTosave
     */
    handlePhotoPost: function(post, author,  postcallback, postTosave) {

        if (post.photos.length === 1) {
            thandler.handleSinglePhotoPost(post, author, postcallback, postTosave);
        } else if (post.photos.length > 1) {

            var photos = [],
                cloudinaryPhotos = [];

            post.photos.forEach(function(p){
                photos.push(p.original_size.url);
            });

            async.eachSeries(
                photos,
                function(url, callback) {
                    cloudinary.uploader.upload(url, function(result) {
                        cloudinaryPhotos.push(result);
                        callback();
                    });
                },
                function(err) {
                    if( err ) {
                        console.log('Something goes wrong with Photos');
                        postcallback(err);
                    } else {
                        var gallery = new Gallery.model({
                            pinned: false,
                            publishedDate: moment.unix(post.timestamp),
                            state: 'published',
                            tags: post.tags,
                            author: author,
                            images: cloudinaryPhotos,
                            caption: removeEOL(unescapeQuote(post.caption))
                        });

                        postTosave.push(gallery);
                        postcallback();
                    }
                }
            );
        } else {
            postcallback("Photo post bad format");
        }
    },
    /**
     * @param post
     * @param author
     * @param postcallback
     * @param postTosave
     */
    handleSinglePhotoPost: function(post, author, postcallback, postTosave) {
        cloudinary.uploader.upload(post.photos[0].original_size.url, function(result) {

            var photo = new Photo.model({
                pinned: false,
                publishedDate: moment.unix(post.timestamp),
                state: 'published',
                tags: post.tags,
                author: author,
                image: result,
                caption: removeEOL(unescapeQuote(post.caption))
            });
            postTosave.push(photo);
            postcallback();
        });
    },
    /**
     * @param post
     * @param author
     * @returns Post
     */
    handleTextPost: function(post, author, postcallback, postTosave) {

        var postDoc =  new Post.model({
            publishedDate: moment.unix(post.timestamp),
            state: 'published',
            tags: post.tags,
            author: author,
            isQuote: false,
            pinned: false,
            title: post.title,
            brief: "",
            extended: removeEOL(unescapeQuote(post.body))
        });

        if (! (postDoc && "title" in postDoc && postDoc.title)) {
            console.log("No title", i, post.body);
            postcallback("No title");
        } else {
            postTosave.push(postDoc);
            postcallback();
        }
    },
    /**
     * @param post
     * @param author
     * @returns Quote
     */
    handleQuotePost: function(post, author, postcallback, postTosave) {

        var quote = new Quote.model({
            publishedDate: moment.unix(post.timestamp),
            state: 'published',
            tags: post.tags,
            author: author,
            pinned: false,
            quote: post.text,
            caption: removeEOL(unescapeQuote(post.source))
        });

        postTosave.push(quote);
        postcallback();
    },
    handleVideoPost: function(post, author, postcallback, postTosave) {

        var medium = new Medium.model({
            publishedDate: moment.unix(post.timestamp),
            state: 'published',
            tags: post.tags,
            author: author,
            pinned: false,
            content: unescapeQuote(post.player[2].embed_code),
            caption: removeEOL(unescapeQuote(post.caption))
        });

        postTosave.push(medium);
        postcallback();
    }
};

/**
 * @param tpost
 */
function outputfile(outputFilename, content) {
    fs.writeFile(
        outputFilename,
        JSON.stringify(content, null, 4),
        function(err) {
            if (err) {
                console.log(err);
            }
        }
    );
}

/**
 * @param rawTitle
 */
function cleanQuoteTitle(rawTitle) {
    var title = "<section>" + ent.decode(decodeURIComponent(rawTitle.replace(/\\"/g, '"').replace(/\\'/g, "&apos;").replace(/\r?\n|\r/g, ""))) + "</section>";
    var $ = cheerio.load(title);
    return $("section").children().first().text();
}

/**
 *
 * @param uri
 * @param filename
 * @param callback
 */
function download(uri, filename, callback){
    request.head(uri, function(err, res, body){
        console.log('content-type:', res.headers['content-type']);
        console.log('content-length:', res.headers['content-length']);

        request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
    });
};

/**
 * http://stackoverflow.com/questions/1026069/capitalize-the-first-letter-of-string-in-javascript
 *
 * @param string
 * @returns {string}
 */
function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

/**
 * @param string
 * @returns String
 */
function removeEOL(string) {
    if (! string ) {
        return "";
    } else {
        return string.replace(/\r?\n|\r/g, "")
    }
}

/**
 * @param string
 * @returns String
 */
function unescapeQuote(string) {
    if (! string ) {
        return "";
    } else {
        return string.replace(/\\'/g, "&apos;").replace(/\\"/g, '"')
    }
}

