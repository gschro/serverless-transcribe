process.env['PATH'] = process.env['PATH'] + ":" + process.env['LAMBDA_TASK_ROOT'] + ':/tmp/'
var AWS = require('aws-sdk');
var ffmpeg = require('fluent-ffmpeg')
var async = require('async')
var child = require('child_process')
AWS.config.update({
    signatureVersion: 'v4'
})
var fs = require('fs')
var s3 = new AWS.S3()

exports.handler = function(event, context, callback) {
    var message = event.Records[0].Sns.Message
    console.log('Message received from SNS:', message)
    var data = JSON.parse(message)

    child.exec('cp /var/task/ffmpeg /tmp/.; chmod 755 /tmp/ffmpeg;', function (err, stdout, stderr) {
        if (err) {
        callback(null, "error ffmpeg move/grant failed " + err)
        } else {
            console.log("stdout: " + stdout)
            console.log("stderr: " + stderr)
            
            var srcBucket = data.audiobucket
            var srcKey    = data.audiofile
            var fileName = srcKey.split('.').pop().join('.')   
            var splitPath = '/tmp/'
            var filepath = splitPath+srcKey

            var params = {
            Bucket: srcBucket, 
            Key: srcKey
            }

            var input = s3.getObject(params).createReadStream()

            //split and convert audio to flac
            var command = ffmpeg()
                .input(input)
                .toFormat('flac')
                .seek(data.start)
                .duration(data.end)
                .outputOptions([
                '-bits_per_raw_sample 16',
                '-ar 16000', 
                '-ac 1'
                ])
                .on('error', function(err) {
                    console.error(err.message);
                })
                .on('end', function() {
                    console.log('Finished Splitting Audio');
                })

                s3.upload({
                        Bucket: 'trrobotsplitaudio',
                        Key: data.filename,
                        Body: command.pipe()
                    },function (err, resp) {
                        if(err){
                            console.error(err)
                        }
                        console.log(resp)
                        callback(null,null);
                    });
        } //if
    }) //exec child process 
}
