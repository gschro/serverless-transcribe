var async = require('async');
var AWS = require('aws-sdk');
AWS.config.update({
    signatureVersion: 'v4'
});
var speech = require('@google-cloud/speech')({
                    projectId: process.env.GOOGLE_PROJECT_ID,
                    keyFilename: process.env.GOOGLE_KEY_FILE_NAME
                });
var fs = require('fs');
var s3 = new AWS.S3();

exports.handler = function(event, context, callback) {
    var srcBucket = event.Records[0].s3.bucket.name;
    var srcKey    = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));  
    var dstBucket = "trrobotsplittranscript";

    var name = srcKey.replace(/\.[^/.]+$/, "")  
    
    async.waterfall([       
        function transcribe(next) {
            const request = {
                config: {
                    encoding: 'FLAC',
                    sampleRateHertz: 16000,
                    languageCode: 'en-US'
                },
                interimResults: false // If you want interim results, set this to true
            };

            const recognizeStream = speech.createRecognizeStream(request)
                .on('error', console.error)
                .on('data', function (data) {
                    //add results to temp text file
                    fs.appendFile('/tmp/' + name + '.txt', data.results, function (err) {
                        if (err) {
                            console.error(err)
                        }
                    })
                });
            s3.getObject({
                    Bucket: srcBucket,
                    Key: srcKey
                })
                .createReadStream()
                .pipe(recognizeStream)
                .on('error',function(err){
                    console.log(err)
                })
                .on('finish',function(){
                    console.log('done transcribing');
                    next();
                });                        
        },
        function upload(next) {
            // Stream the transcription to destination bucket
            s3.upload({
                    Bucket: dstBucket,
                    Key: name + ".txt",
                    Body: fs.createReadStream('/tmp/' + name + '.txt'),
                    ContentType: 'text/plain'
                },
                next);
        },
        function deleteFile(next) {
            // Delete Audio File
            s3.deleteObject({
                    Bucket: srcBucket,
                    Key: srcKey
                },
                next);
        }], 
        function (err) {
            if (err) {
                console.error(
                    'Unable to transcribe ' + srcBucket + '/' + srcKey +
                    ' and upload to ' + dstBucket + '/' + name +
                    ' due to an error: ' + err
                );
            } else {
                console.log(
                    'Successfully transcribed ' + srcBucket + '/' + srcKey +
                    ' and uploaded to ' + dstBucket + '/' + name
                );
            }
            callback(null, "message");
        }
    );
};