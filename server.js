"use strict";
/* Lilypad Hopper — zero-dependency static server (Lilypad deploy contract).
   /healthz is auth-exempt; everything else sits behind basic auth / lp_auth cookie
   when DEMO_PASS is non-empty. Set DEMO_PASS= (empty) in .env to make the game public. */
var http=require("http"),fs=require("fs"),path=require("path");
function loadEnvFile(file,override){var t;try{t=fs.readFileSync(path.join(__dirname,file),"utf8");}catch(e){return;}
  t.split(/\r?\n/).forEach(function(l){l=l.trim();if(!l||l[0]==="#")return;var i=l.indexOf("=");if(i<1)return;
    var k=l.slice(0,i).trim(),v=l.slice(i+1).trim().replace(/^["']|["']$/g,"");if(override||process.env[k]===undefined)process.env[k]=v;});}
loadEnvFile(".env.example",false); loadEnvFile(".env",true);
var ROOT=path.join(__dirname,"public"),PORT=parseInt(process.env.PORT,10)||8080;
var USER=process.env.DEMO_USER||"",PASS=process.env.DEMO_PASS||"",AUTH_ON=PASS!=="";
var MIME={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",
  ".json":"application/json; charset=utf-8",".map":"application/json; charset=utf-8",".svg":"image/svg+xml",
  ".png":"image/png",".jpg":"image/jpeg",".ico":"image/x-icon",".woff2":"font/woff2",".md":"text/markdown; charset=utf-8"};
var auth=require("./demo-auth.cjs")({user:USER,pass:PASS,ttlDays:parseInt(process.env.DEMO_TTL_DAYS,10)||30});
function safe(u){var c=decodeURIComponent(u.split("?")[0]);if(c==="/"||c==="")c="/index.html";
  var f=path.normalize(path.join(ROOT,c));return f.indexOf(ROOT)===0?f:null;}
http.createServer(function(req,res){
  var p=req.url.split("?")[0];
  if(p==="/healthz"||p==="/health"){res.writeHead(200,{"Content-Type":"application/json","Cache-Control":"no-store"});return res.end(JSON.stringify({status:"ok",service:"lilypad-hopper",uptime:process.uptime()}));}
  if(!auth.gate(req,res))return;
  var f=safe(req.url);if(!f){res.writeHead(403);return res.end("Forbidden");}
  fs.stat(f,function(e,s){if(e||!s.isFile()){res.writeHead(404,{"Content-Type":"text/plain"});return res.end("Not found");}
    res.writeHead(200,{"Content-Type":MIME[path.extname(f).toLowerCase()]||"application/octet-stream","Cache-Control":"no-cache","X-Content-Type-Options":"nosniff"});
    fs.createReadStream(f).pipe(res);});
}).listen(PORT,function(){console.log("lilypad-hopper on http://localhost:"+PORT+(AUTH_ON?"  (auth ON)":"  (no auth)"));});
