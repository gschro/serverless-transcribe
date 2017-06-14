var async = require('async');
var AWS = require('aws-sdk');
AWS.config.update({
    signatureVersion: 'v4'
});
var SpeechToTextV1 = require('watson-developer-cloud/speech-to-text/v1');

var speech_to_text = new SpeechToTextV1 ({
  username: process.env.STT_USER,
  password: process.env.STT_PW
});
var s3 = new AWS.S3();

exports.handler = function(event, context, callback) {
    var srcBucket = event.Records[0].s3.bucket.name;
    var srcKey    = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));  
    var dstBucket = "trrobotsplittranscript";

    var name = srcKey.replace(/\.[^/.]+$/, "")  

    var oauthToken = '';
    // Download the image from S3, transform, and upload to a different S3 bucket.
    async.waterfall([        
        function downloadFile(next) {      
            s3.getObject({
                    Bucket: srcBucket,
                    Key: srcKey
                },
                next);
        },
        function transcribe(response, next) {
            var audioInputStream = new require('stream').Transform()
            audioInputStream._transform = function (chunk,encoding,done) 
            {
                this.push(chunk)
                done()
            }

            audioInputStream.end(response.Body);
            audioInputStream.on('finish',function(){
                //watson options
                var params = {
                    model: 'en-UK_BroadbandModel',
                    content_type: 'audio/flac',
                    continuous: true,
                    'interim_results': true,
                    'max_alternatives': 3,
                    'word_confidence': false,
                    timestamps: false,
                    "inactivity_timeout": 300
                };
                // Create the stream.
                var recognizeStream = speech_to_text.createRecognizeStream(params);

                // Pipe in the audio.
                audioInputStream.pipe(recognizeStream);

                //create transcript text file stream
                var transcriptStream = new require('stream').Transform()
                transcriptStream._transform = function (chunk,encoding,done) 
                {
                    this.push(chunk)
                    done()
                }
                // Pipe out the transcription to a text file stream.
                recognizeStream.pipe(transcriptStream);
                // Get strings instead of buffers from 'data' events.
                recognizeStream.setEncoding('utf8');

                // Listen for events.
                recognizeStream.on('error', function(err) { 
                    console.error("error in recog stream "+err)
                    next(err)
                });

                // recognizeStream.on('data', function(event) { 
                //     console.log('Data: '+event); 
                // });

                recognizeStream.on('close', function(){     
                    console.log("done recognizing") 
                    next(null, transcriptStream)
                })                
            })              
        },
        function upload(data, next) {
            // Stream the transcription to destination bucket
            s3.upload({
                    Bucket: dstBucket,
                    Key: name + ".txt",
                    Body: data,
                    ContentType: 'text/plain'
                },
                next);
        },
        function deleteFile(data, next) {
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