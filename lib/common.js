/**
 * A simple module to isolate some import helper
 */
//misc/lib/common.js

var fs          = require('fs'),
    cheerio     = require('cheerio'),
    ent         = require('ent'),
    request     = require('request');

/**
 * @param cloudinary
 * @returns {{clearCloudinary: Function, writeFile: Function, cleanQuoteTitle: Function, unescapeQuote: Function, removeEOL: Function, ucFirst: Function, download: Function}}
 */
module.exports = function(cloudinary) {

    return {
        /**
         * @param callback
         */
        clearCloudinary: function(callback) {
            cloudinary.api.resources(function(result) {
                var ids = result.resources.map(function(a) {return a.public_id;});
                cloudinary.api.delete_resources(ids, function(){
                    console.log(arguments);
                    callback();
                });
            });
        },

        /**
         * Short debug-in-file function
         *
         * @param {String} outputFilename
         * @param {String} content
         */
        writeFile: function(outputFilename, content) {
            fs.writeFile(
                outputFilename,
                JSON.stringify(content, null, 4),
                function (err) {
                    if (err) {
                        console.log(err);
                    }
                }
            );
        },

        /**
         * Create a title for a tumblr quote
         *
         * @param {String} rawTitle
         * @return {String}
         */
        cleanQuoteTitle: function(rawTitle) {
            var title = ent.decode(decodeURIComponent(rawTitle.replace(/\\"/g, '"').replace(/\\'/g, "&apos;").replace(/\r?\n|\r/g, ""))),
                title = "<section>" + title + "</section>",
                $ = cheerio.load(title);
            return $("section").children().first().text();
        },

        /**
         * Replace encoded string with true quote
         *
         * @param {String} encodedString
         * @return {String}
         */
        unescapeQuote: function(encodedString) {
            if (! encodedString ) {
                return "";
            }
            return encodedString.replace(/\\'/g, "&apos;").replace(/\\"/g, '"');
        },

        /**
         * Clean s string from EOL
         *
         * @param {String} eolString
         * @return {String}
         */
        removeEOL: function(eolString) {
            if (! eolString ) {
                return "";
            }
            return eolString.replace(/\r?\n|\r/g, "");
        },

        /**
         * http://stackoverflow.com/questions/1026069/capitalize-the-first-letter-of-string-in-javascript
         *
         * @param {String} string
         * @returns {String}
         */
        ucFirst: function(string) {
            return string.charAt(0).toUpperCase() + string.slice(1);
        },

        /**
         * Simple downloader
         *
         * @param uri
         * @param filename
         * @param callback
         */
        download: function(uri, filename, callback) {
            request.head(uri, function(err, res, body){
                request(uri).pipe(fs.createWriteStream(filename)).on('close', callback);
            });
        }
    };
};