/**
 * Build keystone model instance from Tumblr JSON
 */
//misc/lib/tumblrAdapter.js

var async       = require('async'),
    moment      = require('moment');

/**
 * @param Post
 * @param cloudinary
 * @returns {{}}
 */
module.exports = function(Post, cloudinary, flib) {

    var tumblrAdapter = {};

    /**
     * @param {object} post
     * @param {User} author
     * @param {Function} postCallback
     * @param {Array} postsToSave
     * @return {Post}
     */
    tumblrAdapter.handlePhotoPost = function(post, author, postCallback, postsToSave) {

        //return flib.clearCloudinary(postCallback);

        if (post.photos.length === 1) {
            return tumblrAdapter.handleSinglePhotoPost(post, author, postCallback, postsToSave);
        } else if (post.photos.length > 1) {

            //flib.writeFile("data/"+post.slug+".json", post);
            //return postCallback();

            var photos = [],
                cloudinaryPhotos = [];

            post.photos.forEach(function(p){
                photos.push(p.original_size.url);
            });

            async.eachSeries(
                photos,
                function(url, photosCallback) {
                    cloudinary.uploader.upload(url, function(result) {
                        cloudinaryPhotos.push(result);
                        photosCallback();
                    });
                },
                function(err) {
                    if( err ) {
                        console.log('Something goes wrong with Photos');
                        postCallback(err);
                    } else {
                        var gallery =  new Post.model({
                            key: !post.slug ? post.id : post.slug,
                            type: 'gallery',
                            state: 'published',
                            publishedDate: moment.unix(post.timestamp),
                            pinned: false,
                            images: cloudinaryPhotos,
                            caption: flib.removeEOL(flib.unescapeQuote(post.caption)),
                            tags: post.tags,
                            author: author
                        });

                        postsToSave.push(gallery);
                        postCallback();
                    }
                }
            );
        } else {
            postCallback("Photo post bad format");
        }
    };

    /**
     * @param {object} post
     * @param {User} author
     * @param {Function} postCallback
     * @param {array} postsToSave
     */
    tumblrAdapter.handleSinglePhotoPost = function(post, author, postCallback, postsToSave) {
        cloudinary.uploader.upload(post.photos[0].original_size.url, function(result) {
            var photo =  new Post.model({
                key: !post.slug ? post.id : post.slug,
                type: 'photo',
                state: 'published',
                publishedDate: moment.unix(post.timestamp),
                pinned: false,
                image: result,
                caption: flib.removeEOL(flib.unescapeQuote(post.caption)),
                tags: post.tags,
                author: author
            });

            postsToSave.push(photo);
            postCallback();
        });
    };

    /**
     * @param {object} post
     * @param {User} author
     * @param {Function} postCallback
     * @param {Array} postToSave
     * @return {Post}
     */
    tumblrAdapter.handleTextPost = function(post, author, postCallback, postToSave) {

        var postDoc =  new Post.model({
            key: post.slug,
            type: 'text',
            state: 'published',
            publishedDate: moment.unix(post.timestamp),
            pinned: false,
            title: post.title,
            content: flib.removeEOL(flib.unescapeQuote(post.body)),
            tags: post.tags,
            author: author,
            brief: ""
        });

        if (! (postDoc && "title" in postDoc && postDoc.title)) {
            console.log("No title", post.body);
            flib.writeFile("data/"+post.slug+".json", post);
            postCallback();
        } else {
            postToSave.push(postDoc);
            postCallback();
        }
    };

    /**
     * @param {object} post
     * @param {User} author
     * @param {Function} postcallback
     * @param {Array} postTosave
     * @return {Post}
     */
    tumblrAdapter.handleQuotePost = function(post, author, postCallback, postToSave) {

        var quote =  new Post.model({
            key: post.slug,
            type: 'quote',
            state: 'published',
            publishedDate: moment.unix(post.timestamp),
            pinned: false,
            quote: post.text,
            caption: flib.removeEOL(flib.unescapeQuote(post.source)),
            tags: post.tags,
            author: author
        });

        postToSave.push(quote);
        postCallback();
    };

    /**
     * @param {object} post
     * @param {User} author
     * @param {Function} postCallback
     * @param {Array} postToSave
     * @return {Post}
     */
    tumblrAdapter.handleVideoPost = function(post, author, postCallback, postToSave) {

        var medium =  new Post.model({
            key: post.slug,
            type: 'medium',
            state: 'published',
            publishedDate: moment.unix(post.timestamp),
            pinned: false,
            medium: flib.unescapeQuote(post.player[2].embed_code),
            caption: flib.removeEOL(flib.unescapeQuote(post.caption)),
            tags: post.tags,
            author: author
        });

        postToSave.push(medium);
        postCallback();
    };

    return tumblrAdapter;
};