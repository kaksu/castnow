var util = require("util");
var readTorrent = require('read-torrent');
var peerflix = require('peerflix');
var internalIp = require('internal-ip');
var grabOpts = require('../utils/grab-opts');
var debug = require('debug')('castnow:torrent');
var port = 4102;

var interval = null;

var torrent = function(ctx, next) {
  if (ctx.mode !== 'launch') return next();
  if (ctx.options.playlist.length > 1) return next();
  var path = ctx.options.playlist[0].path;

  if (!/^magnet:/.test(path) &&
      !/torrent$/.test(path) &&
      !ctx.options.torrent) return next();

  if (ctx.options.acestream) return next(); //TODO:
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
  readTorrent(path, function(err, torrent) {
    if (err) {
      debug('error reading torrent: %o', err);
      return next();
    }
    if (!ctx.options['peerflix-port']) ctx.options['peerflix-port'] = port;
    var engine = peerflix(torrent, grabOpts(ctx.options, 'peerflix-'));
    var ip = ctx.options.myip || internalIp();
    var hotswaps = 0;
    var verified = 0;
    var invalid = 0;

    var wires = engine.swarm.wires;
    var swarm = engine.swarm;

    var active = function(wire) {
      debug("peerChoking");
      return !wire.peerChoking;
    };

    engine.on('verify', function() {
      debug('verify');
      verified++;
      engine.swarm.piecesGot += 1;
    });

    engine.on('invalid-piece', function() {
      debug('invalidpiece');
      invalid++;
    });

    var onready = function() {
      //mostrar algo ya que el motor ya inicio
      debug('We are ready');
    };
    if (engine.torrent) onready();
    else engine.on('ready', onready);

    engine.on('hotswap', function() {
      debug('hotswap');
      hotswaps++;
    });

    engine.server.once('listening', function() {
      debug('started webserver on address %s using port %s', ip, engine.server.address().port);
      var filename = engine.server.index.name.split('/').pop().replace(/\{|\}/g, '');
      var filelength = engine.server.index.length;
      debug(util.format("(%d bytes) %s", filelength, filename));
      var updateStatus = function(){
        var unchoked = engine.swarm.wires.filter(active);
        debug(util.format("Peers: %d/%d; Speed: %d KB/s; Downloaded: %d MB",unchoked.length, wires.length, (swarm.downloadSpeed()/1024).toFixed(2), (swarm.downloaded/1024/1024).toFixed(2)));
      };

      interval = setInterval(updateStatus,250);
      ctx.options.playlist[0] = {
        path: 'http://' + ip + ':' + engine.server.address().port,
        type: 'video/mp4',
        media: {
          metadata: {
            title: engine.server.index.name
          }
        }
      };
      next();
    });
  });
};

module.exports = torrent;
