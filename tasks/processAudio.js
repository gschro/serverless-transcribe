process.env['PATH'] = process.env['PATH'] + ":" + process.env['LAMBDA_TASK_ROOT'] + ':/tmp/'
var ffmpeg = require('fluent-ffmpeg')
var async = require('async')
var AWS = require('aws-sdk')
AWS.config.update({
    signatureVersion: 'v4'
})
var fs = require('fs')
var s3 = new AWS.S3()
var child = require('child_process')

exports.handler = function(event, context, callback) {

    var splitLength = parseInt(process.env.SPLIT_LENGTH_SECONDS)
    var topicARN = process.env.TOPIC_ARN    

    async.waterfall([function(next){
            //copy ffmpeg to tmp for use            
            child.exec('cp /var/task/ffmpeg /tmp/. chmod 755 /tmp/ffmpeg', function (err, stdout, stderr) {
                if (err) {
                    callback(null, "error ffmpeg move/grant failed " + error)
                } else {
                    console.log("stdout: " + stdout)
                    console.log("stderr: " + stderr)

                    //get triggered file bucket and name
                    var srcBucket = event.Records[0].s3.bucket.name
                    var srcKey = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "))  

                    //remove extension
                    var fileName = srcKey.split('.').pop().join('.') 
                    var splitPath = '/tmp/'
                    var filePath = splitPath+srcKey
                    
                    var params = {
                        Bucket: srcBucket, 
                        Key: srcKey
                    }
                                     
                    next(null, params)
                }
            })  
        },
        function(params, next){
            //get triggered file stream
            s3.getObject(params).createReadStream()

            //scan file for audio length
            ffmpeg(downloadedFile)
                .outputOptions(['-f null'])
                .output('none')
                .on('error',function(err){
                    callback(null, err)
                })
                .on('end', function(stdout, stderr) {
                    console.log('stderr '+stderr)
                    console.log('stdout '+stdout)   

                    var regex = /time\W(\d{2}:\d{2}:\d{2}\.\d{2})/g                
                    var matches, output = []

                    while (matches = regex.exec(stderr)) {
                        output.push(matches[1])
                    }                

                    var time = output[output.length-1]                      
                    var audioLength = getSeconds(time)

                    next(null, audioLength)
                }).run()
        },                
        function(audioLength, next){
            var fileCount = Math.ceil(audioLength / splitLength)    
                            
            var sns = new AWS.SNS()
            var calls = []
            for(var i = 0; i < fileCount; i++){
                calls.push(i)
            }
            
            async.eachOf(calls,function addMessage(i,key, done){
                var data = {}
                data.audiofile = srcKey
                data.audiobucket = srcBucket
                data.start = i * splitLength
                data.end = data.start + splitLength > audioLength ? audioLength - splitLength : data.start + splitLength

                //set up split audio file name
                data.filename = fileName+'-'+(i+1)+'-'+fileCount+'.flac'

                var params = {
                    Message: JSON.stringify(data),
                    Subject: 'Split Audio',
                    TopicArn: topicARN
                }

                sns.publish(params,function(err, data){
                    if(err){
                        console.error('sns err '+err)
                    }
                    console.log('sns data '+data)
                    done()
                })
            },
            function(er){
                console.error(er)
                next()
            })    
        }],
        function (err) {
            if (err) {
                callback(null,err)
            }
            callback(null,null)       
        })
}

function getSeconds(timeStr){
    //timestr = ##:##:##.##
    var time = timeStr.split('.')
    var mil = time.pop() //remove miliseconds
    var timeArr = time[0].split(':')
    var total = parseInt(timeArr[0])*60*60 + parseInt(timeArr[1])*60 + parseInt(timeArr[2])
    var milFinal = mil > 0 ? mil / 100 : 0
    return total + milFinal
}