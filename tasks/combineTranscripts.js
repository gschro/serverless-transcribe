var async = require('async');
var AWS = require('aws-sdk');
AWS.config.update({
    signatureVersion: 'v4'
});
var stream = require('stream');
var fs = require('fs');
var s3 = new AWS.S3();

exports.handler = function(event, context, callback) {
    var srcBucket = event.Records[0].s3.bucket.name;
    var srcKey    = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));  
    var dstBucket = "trrobotfinal";
    var name = srcKey.replace(/\.[^/.]+$/, "").split('-')
    
    var totalFilesCount = name.pop()
    name.pop()
    var finalName = name.join('-')
    var bucket = srcBucket
    
    var params = { 
      Bucket: bucket,
      Delimiter: '',
      Prefix: finalName
    }
    s3.listObjects(params, function (err, data) {
        if(err){
            console.error(err)
            callback(null, err);
        }
        
        var fileNames =  []
        var files = data.Contents

        var transcriptFileName = finalName + ".txt"

        //check if all partial transcripts are available
        if(files.length !== parseInt(totalFilesCount)){
            callback(null, 'missing one or more partial transcripts')
        }

        var calls = [];
        files.forEach(function(file){
            calls.push(function(callback) {
                var params = {
                    Bucket: data.Name,
                    Key: file.Key
                }
                s3.getObject(params, function(err, data) {
                    if (err) {
                        callback(null, err);
                    } else {
                        fs.appendFile('/tmp/'+transcriptFileName, data.Body.toString('ascii'), function (err) {
                            if (err){
                                console.error(err)
                                callback(null, null);
                            }                                          
                        });
                    }
                });
            })
        })

        async.series(calls, function(err, result) {
            if (err){
                callback(null, "message");
            }

            //delete all partial transcripts
            files.each(function(file, cb){
                s3.deleteObject({Bucket: data.Name, Key: file}, function(err, data) {
                    if (err){ console.log(err, err.stack);}  // error
                    cb()
                });  
            })

            console.log('All files have been processed successfully');
            fs.readFile('/tmp/'+transcriptFileName, function (err, data) {
                if (err) { 
                    callback(null, "message");
                }

                var base64data = new Buffer(data, 'binary');
                s3.putObject({
                    Bucket: 'trrobotfinal',
                    Key: transcriptFileName,
                    Body: base64data
                },function (resp) {
                    console.log('Successfully uploaded transcript');
                    callback(null, "message");
                });
            });
        })        
    });
            
};