var util = require("util");
var http = require("http");
var grabOpts = require('../utils/grab-opts');
var debug = require('debug')('castnow:acestream');
var AcePlayer = require("./aceplayer.js");

var port = 4141;
var acestream = function(ctx, next) {
  if (ctx.mode !== 'launch') return next();
  if (ctx.options.playlist.length > 1) return next();
  var path = ctx.options.playlist[0].path;
  var video_cnt = 0, video_files = null, video_url = null;

  var acePattern = /^(acestream|ts|st):\/\//;
  if (!acePattern.test(path) &&
    !ctx.options.acestream) return next();

  var ip = ctx.options.myip || internalIp();
  var optns = {};
  optns.aceInstallPath = ctx.options["acestream-install-path"]||"C:\\ACEStream\\ACEStream";
  var aceplayer = new AcePlayer(optns);
  var chid = path.replace(acePattern,"");
  var isTorrent = /\.torrent/.test(chid);
  var isHttp = /^http[s]*:\/\//.test(chid);
  var module  = (!isHttp && !isTorrent) ? "PID" : "TORRENT";
  ctx.on("close", function() {
    if (aceplayer) aceplayer.shutdown();
  });
  aceplayer.on("error", function(err) {
    console.error(err);
    if (!video_url) return next(); //Haven't got url.
  });
  aceplayer.on("ready", function() {
    aceplayer.loadTorrent(module, chid);
  });
  aceplayer.on("torrent-loaded", function(cnt, files) {
    video_files = files;
    video_cnt = cnt;
    aceplayer.initVideo(0);
  });
  aceplayer.on("video-ready", function(vurl, fname) {
    debug(vurl);
    video_url = vurl;
    ctx.options.playlist[0] = {
      path: (ctx.options.tomp4) ? vurl : proxyVideo(vurl, ip, port),
      type: 'video/mp4',
      media: {
        metadata: {
          title: fname
        }
      }
    };
    ctx.options.disableTimeline = true;
    ctx.options.disableSeek = true;
    next();
  });
  aceplayer.on("end", function(source) {
    ctx.shutdown();
  });
}

var got = require('got');
function proxyVideo(orgUrl, ip, port) {
  http.createServer(function(req, res) {
    debug('incoming request for url %s', orgUrl);
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*'
    });
    var s = got(orgUrl);
    s.on('error', function(err) {
      debug('got error: %o', err);
    });
    s.pipe(res);
  }).listen(port);
  return util.format('http://%s:%d', ip , port);
}

module.exports = acestream;
