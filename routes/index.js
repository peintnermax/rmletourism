var express = require('express');
var router = express.Router();
var multer = require('multer');


var path = require("path");
var fs = require("fs-extra");
var walker = require("walker");
var request = require("request");
var User = require('../models/user');
var rdfTranslator = require('rdf-translator');

var chunkSize = 500; //number of annotations submitted at a time
var apiKey = ""; //your semantify API key
var folder = ""; //folder where your JSON files are

var giantAnnotationArray = [];
//walker(folder).on("file", fileCallBack).on("end", endCallback);

function fileCallBack(entry, stat) {
    var cid = path.basename(entry, '.json');
    var data = fs.readFileSync(entry, "utf8");
    var annotationObject = {};
    try {
        annotationObject["content"] = JSON.parse(data);
    } catch (e) {
        return;
    }
    annotationObject["cid"] = cid;

    giantAnnotationArray.push(annotationObject);
}

function endCallback() {
    var length = giantAnnotationArray.length;
    var numChunks = Math.ceil(length / chunkSize);

    console.log("Key: "+apiKey+" --> Uploading %d annotation chunks by blocks of %d; total %d transactions", length, chunkSize, numChunks);

    start = 0;
    while (numChunks > 0) {
        end = start + chunkSize;

        if (end > length) {
            end = length;
        }

        makeRequest(giantAnnotationArray.slice(start, end));

        start += chunkSize;
        numChunks--;
    }
}

function makeRequest(chunks) {
    request({
        url: "https://semantify.it/api/annotation/" + apiKey,
        method: "POST",
        json: chunks
    }, function(error, response, body) {
        if (!error && response.statusCode === 200) {
            //console.log(body)
            console.log("ok");

            deleteFolderRecursive(folder);


        } else {
            console.log("error: " + error);
            console.log("response.statusCode: " + response.statusCode);
            console.log("response.statusText: " + response.statusText);
            /*res.render('index',{
              errors:'An error occured'
            });*/
        }
    });
}

var deleteFolderRecursive = function(path) {
  if (fs.existsSync(path)) {
    fs.readdirSync(path).forEach(function(file, index){
      var curPath = path + "/" + file;
      if (fs.lstatSync(curPath).isDirectory()) { // recurse
        deleteFolderRecursive(curPath);
      } else { // delete file
        fs.unlinkSync(curPath);
      }
    });
    //fs.rmdirSync(path);
  }
};



var storage = multer.diskStorage({ //multers disk storage settings
    destination: function (req, file, cb) {
        //cb(null, './upload/Peintner')
        cb(null, folder)
    },
    filename: function (req, file, cb) {
				if(file.originalname.match(/\.(jsonld)$/)  ||  file.originalname.match(/\.(n3)$/) ||  file.originalname.match(/\.(ttl)$/)){
          //cb(null,Date.now()+ '_' +file.originalname );
          cb(null,path.basename(file.originalname,path.extname(file.originalname))+'_'+Date.now()+ path.extname(file.originalname));
				}else{

          var err = new Error();
					err.code = 'filetype';
					return cb(err);
        }
    }

    //var storage = multer.memoryStorage()

});


var upload = multer({ storage: storage }).single('json_file');
var fs = require('fs');


router.post('/upload', function(req,res){
  //console.log(req.user.username);
  //rimraf('upload', function () { console.log('done'); });
	upload( req, res,function(err){
    var key = req.body.apikey;
    if(!key){
        //req.flash('error_msg', 'No key specified');
        res.render('index',{
          error_msg:'No key specified',
          headertitle:'Try again'
        });
    }
    else{
      apiKey = key;
      if(err){
        console.log(err);
        if(err.code =='filetype'){
          res.render('index',{
            error_msg:'Filetype must be JSONLD or N3!',
            headertitle:'Try again'
          });
  			}
        else{
          res.render('index',{
            error_msg:'An error occured. Try again!',
            headertitle:'Try again'
          });
        }

      }else{//if key is not empty
        if (req.file == undefined){
          res.render('index',{
            error_msg:'No file selected!',
            headertitle:'Get started'
          });
        }
        else if(path.extname(req.file.originalname)=='.n3' || path.extname(req.file.originalname)=='.ttl') {
          var filedest='';
          fs.readdirSync(folder).forEach(function(file, index){
            filedest = folder + "/" + file;
          });
          //uri = 'https://raw.githubusercontent.com/DOREMUS-ANR/doremus-ontology/master/doremus.ttl'

          fs.readFile(filedest, 'utf8', function (err,data) {
            if (err) {
              console.log(err);
              res.render('index',{
                error_msg:'Error reading the file!',
                headertitle:'Try again'
              });
            }
            else{
              rdfTranslator(data, 'n3', 'json-ld', function(err, data) {
                if (err){
                  console.log(err);
                  res.render('index',{
                    error_msg:'Error converting the file!'+'\n'+err,
                    headertitle:'Try again'
                  });
                }
                else{
                //console.log(data);
                //var json = JSON.parse(data);
                  fs.unlinkSync(filedest);
                  fs.writeFile(filedest+'.jsonld', data, 'utf8', function (err) {
                      if (err) {
                          return console.log(err);
                          res.render('index',{
                            error_msg:'Error writing the converted file!',
                            headertitle:'Try again'
                          });
                      }else{
                        console.log("The file was converted!");
                        console.log('walker key:' +key);
                        //folder = folder+'/'+req.user.username;
                        walker(folder).on("file", fileCallBack).on("end", endCallback).on('error', function(er, entry, stat) {
                          console.log('Got error ' + er + ' on entry ' + entry)
                        });
                        res.render('index',{
                          success_msg:'Files are converted to JSONLD and uploaded to website with Key '+key,
                          headertitle:'Continue with another file'
                        });
                      }
                  });
                }
              });
            }
          });



        }
        else{
          console.log('walker key:' +key);
          //folder = folder+'/'+req.user.username;
          walker(folder).on("file", fileCallBack).on("end", endCallback).on('error', function(er, entry, stat) {
            console.log('Got error ' + er + ' on entry ' + entry)
          });
          res.render('index',{
            success_msg:'Files are converted to JSONLD and uploaded to website with Key '+key,
            headertitle:'Continue with another file'
          });
        }
      }
    }
  });
});

// Get Homepage
router.get('/', ensureAuthenticated, function(req, res){
	res.render('index',{
    headertitle:'Get Started'
  });
  folder = 'upload/'+req.user.username;
  if (!fs.existsSync(folder)){
      fs.mkdirSync(folder);
  }
  //console.log('folder: '+folder);
});

function ensureAuthenticated(req, res, next){
	if(req.isAuthenticated()){
		return next();
	} else {
		//req.flash('error_msg','You are not logged in');
		res.redirect('/users/login');
	}
}





module.exports = router;
