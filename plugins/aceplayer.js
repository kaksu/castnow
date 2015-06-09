var util = require("util"),
  events = require("events"),
  path = require("path");
  os = require("os"),
  fs = require("fs"),
  crypto = require('crypto'),
  net = require("net"),
  qs =  require('querystring'),
  cp = require('child_process');
var debug = require('debug')('aceplayer');

/**
 * This will initialize aceplayer including starting process and establishing socket connection
 * This is raise "ready" or "error"
 * @param options
 */
function acePlayer(options) {
  options || (options = {});
  this._aceIp=options.aceIp||"127.0.0.1";
  this._myIp=options.myIp||this._aceIp;
  this._aceDefaultPort=options.aceDefaultPort||62062;
  this._aceApiKey=options.aceApiKey||"n51LvQoTlJzNGaFxseRK-uvnvX-sD4Vm5Axwmc4UcoD-jruxmKsuJaH0eVgE";
  this._aceInstallPath=options.aceInstallPath||"";
  this._socket = null;
  events.EventEmitter.call(this);
  process.nextTick(function() {
    this._startAceProcess(function(err) {
      if (err) {
        console.error('error starting ace player: %o', err);
        this.emit("error",err);
        return;
      }
      this._getAcePort(function(err, acePort) {
        if (err) {
          console.error('error getting ace player port: %o', err);
          this.emit("error",err);
          return;
        }
        this._connectPlayer(this._aceIp, acePort);
      }.bind(this));

    }.bind(this));
  }.bind(this));
}

util.inherits(acePlayer, events.EventEmitter);

module.exports = acePlayer;


/**
 * Load torrent
 * This is raise "torrent-loaded"
 * @param mode
 * @param torrent
 */
acePlayer.prototype.loadTorrent = function(mode, torrent) {
  this.engine.load(mode, torrent);
};

/**
 * Initialize video
 * This is raise "video-ready"
 * @param index
 */
acePlayer.prototype.initVideo = function(index) {
  this.engine.start(index);
};

/**
 * Shuts down player
 */
acePlayer.prototype.shutdown = function() {
  if (this._socket) {
    if (this.engine) {
      this.engine.stop();
      this.engine.shutdown();
    }
    this._socket.end();
    this._socket.destroy();
  }
  this._socket = null;
  this._endAceProcess();
};

/**
 * Stop running video
 */
acePlayer.prototype.stop = function() {
  if (this.engine) this.engine.stop();
};

//os.platform() : 'linux'
//os.platform() : 'darwin'
//os.platform() : 'win32'
//os.platform() : 'sunos'
acePlayer.prototype._startAceProcess = function startAceProcess(cb) {
  switch (os.platform()) {
    case "win32":
      var aceBin = path.join(this._aceInstallPath, "engine", "ace_engine.exe");
      this._aceProcess = cp.spawn(aceBin);
      break;
    case "linux": //linux
      var aceBin = path.join(this._aceInstallPath, 'acestreamengine');
      var cmd = [aceBin, '--client-console', '--lib-path', this._aceInstallPath];
      //if (total_max_download_rate) {
      //  cmd.push('--download-limit');
      //  cmd.push(total_max_download_rate.toString());
      //}
      //if (total_max_upload_rate) {
      //  cmd.push('--upload-limit');
      //  cmd.push(total_max_upload_rate.toString());
      //}
      //TODO: Should we use spawn???
      this._aceProcess = cp.exec(cmd.join(' '));
      break;
    case "darwin": //osx
      var cmd = [path.join('/Applications', 'Ace Stream.app', 'Contents', 'Resources', 'Wine.bundle', 'Contents', 'Resources', 'bin', 'wine'),
                 path.join('/Applications', 'Ace Stream.app', 'Contents', 'Resources', 'wineprefix', 'drive_c', 'users', 'IGHOR', 'Application Data', 'ACEStream', 'engine', 'aceengine.exe')];
      //TODO: Should we use spawn???
      this._aceProcess = cp.exec(cmd.join(' '));
      break;
    default:
      cb(new Error(util.format("Platform %s not supported", os.platform())));
      return;
  }
  var spawnErr = null;
  this._aceProcess.stdout.on('data', function(data) {
    debug('stdout: ' + data);
  }.bind(this));
  this._aceProcess.stderr.on('data', function(data) {
    debug('stdout: ' + data);
  }.bind(this));
  this._aceProcess.on('error', function(err) {
    spawnErr = err;
    debug('Error starting process : ' + err);
  }.bind(this));
  this._aceProcess.on('close', function(code, signal) {
    debug('Closing code: ' + code);
    this._aceProcess = null;
  }.bind(this));
  this._aceProcess.on('exit', function(code, signal) {
    debug('Exit code: ' + code);
    this._aceProcess = null;
  }.bind(this));
  setTimeout(function() {
    cb(spawnErr);
  }.bind(this), 8000);
};

//os.platform() : 'linux'
//os.platform() : 'darwin'
//os.platform() : 'win32'
//os.platform() : 'sunos'
acePlayer.prototype._endAceProcess = function endAceProcess() {
  debug("Killing processes");
  if (this._aceProcess) {
    try {
      this._aceProcess.kill(); //TRY sending SIGTERM
      //this._aceProcess.kill('SIGHUP'); //TRY sending SIGHUP
      debug("SIGTERM SENT!!!")
    } catch (ex) {
      console.error("Error sending kill command", ex)
    }
  } else {
    //If process was already running the spawn would have just closed
    //debug("Nothing to kill!!!");
    //return;
  }
  switch (os.platform()) {
    case "win32":
      //var killCmd = "taskkill /F /PID " + this._aceProcess.pid + " /T";
      var killCmd = "taskkill /F /IM ace_engine.exe /T";
      cp.exec(killCmd, function (err, stdout, stderr) {
        debug('stdout: ' + stdout);
        debug('stderr: ' + stderr);
        if(err !== null) {
          debug('exec error: ' + err);
        }
      });
      break;
    case "linux": //linux
      break;
    case "darwin": //osx
      var killCmd = [path.join('/Applications', 'Ace Stream.app', 'Contents', 'Resources', 'Wine.bundle', 'Contents', 'Resources', 'bin', 'wine'),
        path.join('/Applications', 'Ace Stream.app', 'Contents', 'Resources', 'wineprefix', 'drive_c', 'windows', 'system', 'taskkill.exe'), '/f', '/im', 'aceengine.exe'];
      cp.exec(killCmd.join(), function (err, stdout, stderr) {
        debug("STDOUT:" + stdout);
        debug("STDERR:" + stderr);
        if (err !== null) {
          console.error('exec error: ' + err);
        }
      });
      break;
    default:
      debug(util.format("Platform %s not supported", os.platform()));
      break;
  }
};

//os.platform() : 'linux'
//os.platform() : 'darwin'
//os.platform() : 'win32'
//os.platform() : 'sunos'
acePlayer.prototype._getAcePort = function getAcePort(cb) {
  switch (os.platform()) {
    case "win32":
      var pfile = path.join(this._aceInstallPath, "engine", 'acestream.port');
      fs.readFile(pfile, function (err, data) {
        cb(err, parseInt(data.toString()));
      });
      break;
    case "darwin": //osx
      var epath = path.join('/Applications', 'Ace Stream.app', 'Contents', 'Resources', 'wineprefix', 'drive_c', 'users', 'IGHOR', 'Application Data', 'ACEStream', 'engine');
      var pfile = path.join(epath, 'acestream.port');
      fs.readFile(pfile, function (err, data) {
        cb(err, parseInt(data.toString()));
      });
      break;
    case "linux": //linux
    default:
      cb(null, this._aceDefaultPort);
      break;
  }
};

acePlayer.prototype._connectPlayer = function(aceIp, acePort) {
  this._socket = net.createConnection(acePort, aceIp, function () {
    debug('connected to server!');
    //initialize communication
    this.engine = new aceEngine(this._socket, this._aceApiKey);
    this.engine.hellobg(); //say hello
    debug("Initiated awaiting response");
  }.bind(this));
  this._socket.setNoDelay(true);
  this._socket.setKeepAlive(true, 5000);
  var msgBuf = new Buffer(0);
  this._socket.on("data", function (dataBuf) {
    msgBuf = Buffer.concat([msgBuf, dataBuf]);
    var data = msgBuf.toString("utf8");
    //debug(util.format("Received: %s:", data)); //TODO: comment this
    var idx = 0, initialLength = data.length;
    //Can have multiple commands
    while ((idx = data.indexOf("\r\n")) >= 0) { //wait for additional data
      var msg = data.substring(0, idx);
      data = data.substring(idx + 2);
      this._handleResponse(msg);
    }
    if (data.length < initialLength) msgBuf = new Buffer(data, "utf8"); //Keep incomplete portion of response

  }.bind(this));
  this._socket.on("error", function (err) {
    console.error("Socket Error: " + err);
    this.emit("error", err);
  }.bind(this));
  this._socket.on("timeout", function () {
    console.error("Socket timeout");
  }.bind(this));
  this._socket.on("end", function () {
    //TODO: Initialize shutdown
    debug("Socket End");
    this.emit("end", "connection");
    this._socket = null;
  }.bind(this));
  this._socket.on("close", function (had_error) {
    //TODO: Initialize shutdown
    debug("Socket Close");
    if (this._socket) {
      this.emit("end", "connection");
    }
    this._socket = null;
  }.bind(this));
};

acePlayer.prototype._handleResponse = function(msg) {
  debug("handleResponse: "+msg);
  var msgArr = msg.split(" ");
  var comm = msgArr.shift();
  this.msg=msg;
  switch (comm) {
    //HELLOTS
    //response command as a part of handshake procedure
    case "HELLOTS": //Response to HELLOBG
      var tver = "1.0.6", key = null;
      if (msgArr.length) {
        var verArr = msgArr[0].split("=");
        if (verArr.length > 1) tver = verArr[0];
      }
      var match = /key=(.*)/.exec(msg);
      if (match) key = match[1].split(" ")[0];
      this.engine.version = tver;
      this.engine.key = key;
      this.engine.ready(key);
      break;
    //AUTH <auth_level>
    //  User's access level
    //  auth_level - integer - access level
    //  At this moment two values of access level are available:
    //  0 - advanced features are not available for user (rewind and playback of torrent files with several video files)
    //  1 - advanced features are available for user
    case "AUTH": //do we care. AUTH 1 is advanced features
      this.emit("ready"); //Player is ready. Load of torrent can be invoked
      break;
    //LOADRESP <request_id> <response>
    //  Response to LOAD command
    //  request_id - request identifier
    //  response - a list of files in json format in this form:
    //{
    //  "status": 1,
    //  "infohash": "abcd1234",
    //  "files": [
    //  ["file1.mp4", 0],
    //  ["file2.avi", 1],
    //  ["file3.mkv", 5]
    //]
    //}
    //  status - 0: there are no video files in torrent, 1 - there is one video file in torrent, 2 - there are more than one video files in torrent
    //  infohash - torrent infohash
    //  files - a list of files; this is an array, each element of which consists of an array with two elements: the first - file's name, the second - file's position in torrent (this position must be sent inside START command to specify which file to download, if there are several of them).
    //  Files' names are transferred in UTF-8 encoding in urlencoded form.
    case "LOADRESP": //Meta data of the stream. This is in response to LOADASYNC
      //Ex: LOADRESP 467763 {"status": 1, "files": [["Prey% 202_% 20E3% 202011% 20Official% 20Trailer_2.mp4", 0]], "infohash":  "4c78e1cf0df23b4f5a16a106829ebed710cb52e0"}
      var jstr = msg.substring(msg.indexOf("{"), msg.length).trim();
      try {
        var video_meta = this.engine.video_meta = JSON.parse(jstr);
        this.engine.video_files =video_meta.files; //jstr.split('\n')[0]
        this.engine.video_count = (video_meta.status === 2) ? video_meta.files.length : video_meta.status; //status = 2,1,0
        debug(util.format("files:%j", video_meta.files));
        this.emit("torrent-loaded", this.engine.video_count, this.engine.video_files); //Torrent stream is loaded. Start can be invoked
      } catch (ex) {
        console.error("Error parsing command LOADRESP %s [SHUTTING DOWN]", jstr);
        this.emit("error", ex);
      }
      break;
    //EVENT event_name param1_name=param1_value param2_name=param2_value ...
    //  Parameters are not required.
    //  Parameter values - urlencoded utf-8
    case "EVENT":
      var evnt = msgArr.shift();
      switch (evnt) {
        case "cansave": //Server is ready to call SAVE //TODO: review this
          var file=msgArr.slice(0,2);
          var fileIdx=parseInt(file[0].split('=')[1]);
          if (fileIdx===this.engine.fileIdx) {
            this.engine.file=file;
            this.engine.save(file, this.engine.video_files[fileIdx][0]);
          }
          break;
        case "getuserdata": //server wants user details [1:Man,2:Woman 1:<13,2:13-17,3:18-24,4:35-44,6:45-54,7:55-64,8:>64yrs
          this.engine.userdata();
          break;
      }
      break;
    //PLAY <video_url>
    //PLAYAD <video_url>
    //PLAYADI <video_url>
    //Start playing video by video_url link (this link leads to http-server, embedded in TS Engine).
    //PLAY - playback of the main video
    case "START":
    case "PLAY":
      var myip = this._myIp; //TODO:
      this.engine.video_url=msgArr.shift().replace('127.0.0.1',myip);
      debug(util.format("Got Link:%s",this.engine.video_url));
      this.engine.video_params=msgArr;
      if (msgArr.indexOf("stream=1") >= 0) debug("Live Stream");
      else debug("VOD Stream");
      var fname = qs.unescape(this.engine.video_files[this.engine.fileIdx][0]).replace('/','_').replace('\\','_'); //It will try to use decodeURIComponent in the first place, but if that fails it falls back to a safer equivalent that doesn't throw on malformed URLs.
      this.emit("video-ready", this.engine.video_url, fname); //Torrent stream has started. Play or Save can be invoked
      break;
    //STATE <state_id>
    //  Information about current state of TS Engine
    case  "STATE": //0:IDLE,1:PREBUFFERING,2:DOWNLOADING,3:BUFFERING,4:COMPLETED,5:CHECKING,6:ERROR
      this.engine.state=parseInt(msgArr[0]);
      break;
    //RESUME
    //  TS Engine finished buffering
    case "RESUME":
      this.engine.paused=false;
      break;
    //PAUSE
    //  TS Engine began buffering, because there's not enough data for video playback without interruptions
    case "PAUSE":
      this.engine.paused=true;
      break;
    //STATUS <status_string>
    //  This message is sent periodically to inform client about current state of content download.
    //  status_string - string in format described below
    case "STATUS": //Status. Just log
      this._processStats(msgArr[0]);
      break;
    //INFO <message_id>;<message_text>
    //Info message
    //  message_id - message code
    //  message_text - message text
    case "INFO":
      debug(msg);
      break;
    //SHUTDOWN
    //  TS Engine finished its work
    case "SHUTDOWN":
      this.emit("end", "shutdown");
      break;
  }
};

/**
 * Process stats received from engine
 * @param statsStr
 * @private
 */
acePlayer.prototype._processStats = function (statsStr) {
  //If the main content is being played:
  //  STATUS main:status_string
  //
  //If advertising video is being played:
  //  STATUS main:status_string|ad:status_string
  //
  //status_string:
  //  TS Engine does nothing - idle
  //error - err;error_id;error_message (code and description)
  //checking - check;progress
  //prebuffering - prebuf;progress;time
  //download - dl
  //buffering - buf;progress;time
  //waiting for sufficient speed - wait;time
  //
  //Common data is added to all status_string (except idle, err, check):
  //total_progress;immediate_progress;speed_down;http_speed_down;speed_up;peers;http_peers;downloaded;http_downloaded;uploaded
  //total_progress - how much of this file is downloaded
  //immediate_progress - how much uninterruptible data is downloaded starting from the current position (to show amount of downloaded data)
  //
  //All numbers are sent as integer.
  //  All progress takes values from 0 to 100.
  //
  //Examples:
  //  STATUS main:prebuf;45;30|ad:buf;69
  //STATUS main:dl|ad:dl
  //Example of tranformation statuses into text messages that user can understand:
  //  check - Checking xx%
  //prebuf - Prebuffering xx%
  //buf - Buffering xx%
  //wait - Waiting sufficient download speed
  //err - showing an error message
  //dl, idle - doing nothing
  //main:buf;51;0;0;0;326;0;18;13;0;38617088;0;2785280
  var statsArr = statsStr.split(";");
  var st = statsArr.shift().split(":")[1];
  //var match = /main:[a-z]+/.exec(statsStr); //main:buf
  //var st=match[0].split(':')[1];
  this.engine.proc=0;
  this.engine.label=" ";
  this.engine.line=" ";
  switch (st) {
    case "idle":
      debug("Received command Engine idle");
      break;
    case "starting":
      debug("Received command starting TS");
      break;
    case "err":
      this.engine.err = "dl";
      debug("Received command ERROR!");
      break;
    case "check":
      this.engine.proc=parseInt(statsArr[0]);
      debug("Received command check");
      break;
    case "prebuf":
      this.engine.proc=parseInt(statsArr[0])+0.1;
      this.engine.line=util.format("Seeds:%s Download:%sKb/s",statsArr[7],statsArr[4]);
      var engine_data = { "action": "Pre-buffering", "percent": statsArr[0]+ "%","download":statsArr[4]+" Kb/s", "upload":statsArr[6]+" Kb/s","seeds":statsArr[7],"total_download":(parseInt(statsArr[9])/(1024*1024)).toString()+'Mb',"total_upload":(parseInt(statsArr[11])/(1024*1024)).toString()+'Mb' };
      debug(util.format("Received command: %j", engine_data));
      break;
    case "loading":
      debug("Received command loading");
      break;
    case "dl":
      var engine_data = { "action": "Downloading", "percent": statsArr[0]+ "%","download":statsArr[2]+" Kb/s", "upload":statsArr[4]+" Kb/s","seeds":statsArr[5],"total_download":(parseInt(statsArr[7])/(1024*1024)).toString()+'Mb',"total_upload":(parseInt(statsArr[9])/(1024*1024)).toString()+'Mb' };
      debug(util.format("Received command: %j", engine_data));
      break;
    case "buf":
      var engine_data = { "action": "Buffering", "percent": statsArr[0]+ "%","download":statsArr[4]+" Kb/s", "upload":statsArr[6]+" Kb/s","seeds":statsArr[7],"total_download":(parseInt(statsArr[9])/(1024*1024)).toString()+'Mb',"total_upload":(parseInt(statsArr[11])/(1024*1024)).toString()+'Mb' };
      debug(util.format("Received command: %j", engine_data));
      break;
  }
};

function aceEngine(socket, aceApiKey) {
  this._socket = socket;
  this._aceApiKey = aceApiKey;
}
aceEngine.prototype._sendCommand = function(data) {
  debug(util.format("Send Command: %s", data));
  this._socket.write(data+'\r\n',"utf8");
  //, function(err) {
  //    if (err) {
  //      console.error('error sending command to ace player : %o', err);
  //      cb(err);
  //    }
  //  });
};
/**
 * Used as a part of "handshake" procedure between client and TS Engine.
 * This command must be sent by client right after establishing tcp-connection with TS Engine.
 * Connection with TS Engine is successful, if client receives from TS Engine response to "handshake" - command HELLOTS
 */
aceEngine.prototype.hellobg = function() {
  this._sendCommand("HELLOBG");
};
/**
 * Informs TS Engine that client is ready to receive outgoing commands
 * @param key
 */
aceEngine.prototype.ready = function(key) {
  var ready = 'READY';
  if (key) {
    var shasum = crypto.createHash("sha1");
    shasum.update(key + this._aceApiKey, "ascii");
    key = shasum.digest("hex");
    var pk = this._aceApiKey.split('-')[0];
    key = util.format("%s-%s", pk, key);
    ready = util.format("READY key=%s", key);
  }
  this._sendCommand(ready); //send ready command
};
/**
 * This is async version of load
 * @param mode PID or TORRENT
 * @param torrent CHID -> [ACESTREAMID or .torrent file/url]
 */
aceEngine.prototype.load = function(mode, torrent) {
  //LOAD TORRENT <torrent_url> <developer_id> <affiliate_id> <zone_id>
  //LOAD INFOHASH <torrent_infohash> <developer_id> <affiliate_id> <zone_id>
  //LOAD PID <player_id>
  //LOAD RAW <torrent_data> <developer_id> <affiliate_id> <zone_id>
  //LOADASYNC <request_id> TORRENT <torrent_url> <developer_id> <affiliate_id> <zone_id>
  //LOADASYNC <request_id> INFOHASH <torrent_infohash> <developer_id> <affiliate_id> <zone_id>
  //LOADASYNC <request_id> PID <player_id>
  //LOADASYNC <request_id> RAW <torrent_data> <developer_id> <affiliate_id> <zone_id>
  //These commands perform loading torrent-file's content. They are used to allow client to get a list of files' names in file of interest. LOAD commands are performed synchronously, LOADASYNC commands - asynchronously (response comes in outgoing command LOADRESP).
  //Preferred method is asynchronous loading.
  //  Parameters:
  //request_id - random integer - identifier of LOADASYNC request; this identifier will be sent to client in LOADRESP command after a list of files will be received; this id serves to ensure that client in case of sending multiple LOAD requests knew exactly which of these requests is answered
  //torrent_url - link to torrent file (for example, http://sometracker.com/torrent/12345)
  //torrent_infohash - torrent's infohash
  //player_id - player's code
  //torrent_data - torrent-file's content, encoded in base64
  //developer_id - developer's code (if unknown, 0 must be sent)
  //affiliate_id - partner's code (if unknown, 0 must be sent)
  //zone_id - code of partner's zone (if unknown, 0 must be sent)
  this.mode = mode;
  this.torrent_url = torrent;
  var spons = (mode!="PID") ? " 0 0 0": "";
  var cmd=util.format("LOADASYNC %s %s %s%s", Math.floor(Math.random() * 0x7fffffff).toString(), mode, torrent, spons);
  this._sendCommand(cmd);
};
/**
 *
 * @param index
 */
aceEngine.prototype.start = function(index) {
  //START TORRENT <torrent_url> <file_indexes> <developer_id> <affiliate_id> <zone_id>
  //START INFOHASH <torrent_infohash> <file_indexes> <developer_id> <affiliate_id> <zone_id>
  //START PID <player_id> <file_indexes>
  //START RAW <torrent_data> <file_indexes> <developer_id> <affiliate_id> <zone_id>
  //START URL <direct_url> <file_indexes> <developer_id> <affiliate_id> <zone_id>)
  //These commands are used to start loading a specific file from torrent or by direct link (START URL)
  //Parameters:
  //  file_indexes - a list of file's indexes from torrent file, which have to be loaded. Client receives file's indexes in a LOADRESP message, separated by commas. Indexes start with zero and match a list of files that was received by LOAD command. For example, if there is only one video file in torrent file, then 0 index has to be sent.
  //  If there are 5 video files in torrent and playback has to start from the first one, but others have to be loaded, then 0,1,2,3,4 have to be sent.
  //  If the third file has to be played, without loading others, 2 has to be sent.
  //  torrent_url - link to torrent file (for example, http://sometracker.com/torrent/12345)
  //torrent_infohash - torrent's infohash
  //player_id - player's code
  //torrent_data - torrent-file's content, encoded in base64
  //direct_url - direct link to file (for example, http://somesite.com/files/video.mp4)
  //developer_id - developer's code (if unknown, 0 must be sent)
  //affiliate_id - partner's code (if unknown, 0 must be sent)
  //zone_id - code of partner's zone (if unknown, 0 must be sent)
  var mode = this.mode;
  var torrent = this.torrent_url;
  this.fileIdx = index;
  var spons = (mode!="PID") ? " 0 0 0": "";
  var cmd=util.format("START %s %s %s%s", mode, torrent, index.toString(), spons);
  this._sendCommand(cmd);
};

/**
 *
 * @param file
 * @param filename
 */
aceEngine.prototype.save = function(file, filename) {
  var fname = qs.unescape(filename).replace('/','_').replace('\\','_'); //It will try to use decodeURIComponent in the first place, but if that fails it falls back to a safer equivalent that doesn't throw on malformed URLs.
  var cmd=util.format("SAVE %s path=%s", file.join(), qs.escape(fname)); //can use encodeURIComponent
  this._sendCommand(cmd);
};
/**
 * Getting code of the player through a set of parameters. This command is a synchronous command (see below). In response player's code or empty string (if player's code can't be received) is sent.
 */
aceEngine.prototype.getpid = function() {
  var infohash = this.video_meta.infohash;
  var cmd = util.format("GETPID %s 0 0 0", infohash);
  this._sendCommand(cmd);
};
/**
 * Inform TS Engine about duration of video file that is being played by client at this moment. This command must be sent right after client had determined content duration.
 * Parameters:
 * video_url - link to video, which was sent to client after the end of pre-buffering
 * duration - duration in milliseconds
 * @param duration
 */
aceEngine.prototype.dur = function(duration) {
  var video_url = this.video_url;
  var cmd = util.format("DUR %s %s", video_url, duration);
  this._sendCommand(cmd);
};
/**
 * Inform TS Engine about percentage of played video
 * This command is especially important when playing advertising video - transition to the main video happens only after TS Engine gets command PLAYBACK 100 (after client has played advertising video till the end)
 * Parameters:
 * video_url - link to video, which was sent to client after the end of pre-buffering
 * event - one of these events:
 * 0 - starting playback
 * 25 - 25% of video has been played
 * 50 - 50% of video has been played
 * 75 - 75% of video has been played
 * 100 - 100% of video has been played
 * @param event
 */
aceEngine.prototype.playback = function(event) {
  var video_url = this.video_url;
  var cmd = util.format("PLAYBACK %s %d", video_url, event);
  this._sendCommand(cmd);
};
/**
 *  Send user data
 */
aceEngine.prototype.userdata = function() {
  this._sendCommand('USERDATA [{"gender": 1}, {"age": 4}]');
};
/**
 * Stop loading file that is being loaded at this moment.
 */
aceEngine.prototype.stop = function() {
  this._sendCommand("STOP");
};
/**
 * Close connection with client.
 */
aceEngine.prototype.shutdown = function() {
  this._sendCommand("SHUTDOWN");
};
//>> - messages from client to TS Engine
//<< - messages from TS Engine to client
//
//1) Playback of torrent-file by link without commercials (TS Engine determines whether it's needed to play commercials).
//Asynchronous command LOADASYNC is used to load torrent's content.
//Torrent file contains one video file.
//
//  handshake
//>>HELLOBG
//<<HELLOTS
//client is ready to receive messages
//>>READY
//advanced functions are available for user
//                                     <<AUTH 1
//load torrent by link
//>>LOADASYNC 467763 TORRENT http://rutor.org/download/67346 0 0 0
//  <<LOADRESP 467763 {"status": 1, "files": [["Prey%202_%20E3%202011%20Official%20Trailer_2.mp4", 0]], "infohash":
//  "4c78e1cf0df23b4f5a16a106829ebed710cb52e0"}
//get player's code (for example, to show it to user)
//>>GETPID 4c78e1cf0df23b4f5a16a106829ebed710cb52e0 0 0 0
//<<##36ae4c89ab45b4010b1461c513da38d007356195
//start video pre-buffering
//>>START TORRENT http://rutor.org/download/67346 0 0 0 0
//  pre-buffering is in the process
//<<STATE 1
//<<STATUS main:prebuf;0;2147483447;0;0;0;0;0;0;0;0;0;0
//<<STATUS main:prebuf;0;2132;0;0;29;0;0;8;0;131072;0;0
//<<STATUS main:prebuf;8;942;0;0;60;0;0;9;0;393216;0;0
//<<STATUS main:prebuf;50;591;0;0;87;0;0;8;0;835584;0;0
//<<STATUS main:prebuf;75;497;0;0;98;0;0;8;0;1146880;0;0
//<<STATUS main:prebuf;91;448;0;0;105;0;0;8;0;1441792;0;0
//pre-buffering is finished, client gets a link for content playback
//<<PLAY http://127.0.0.1:6878/content/4c78e1cf0df23b4f5a16a106829ebed710cb52e0/0.673752283974
//  <<STATE 2
//client sends content duration (~201 seconds)
//>>DUR http://127.0.0.1:6878/content/4c78e1cf0df23b4f5a16a106829ebed710cb52e0/0.673752283974 201964
//  client informs that playback was started
//>>PLAYBACK http://127.0.0.1:6878/content/4c78e1cf0df23b4f5a16a106829ebed710cb52e0/0.673752283974 0
//  TS Engine loads content
//<<STATUS main:dl;0;0;110;0;0;8;0;1622016;0;0
//<<STATUS main:dl;0;0;128;0;0;8;0;2965504;0;0
//<<STATUS main:dl;0;0;130;0;0;8;0;3129344;0;0
//TS Engine doesn't have enough data for playback, starts buffering
//<<PAUSE
//<<STATE 3
//<<STATUS main:buf;0;315;0;0;130;0;0;8;0;3260416;0;0
//<<STATUS main:buf;90;299;0;0;133;0;0;8;0;3866624;0;0
//<<STATUS main:buf;90;278;0;0;138;0;0;8;0;4390912;0;0
//buffering is finished
//<<RESUME
//<<STATE 2
//<<STATUS main:dl;0;0;141;0;0;8;0;4898816;0;0
//client has played 25% of content
//>>PLAYBACK http://127.0.0.1:6878/content/4c78e1cf0df23b4f5a16a106829ebed710cb52e0/0.673752283974 25
//  <<STATUS main:dl;0;0;141;0;0;8;0;4898816;0;0
//<<STATUS main:dl;0;0;146;0;0;7;0;8388608;0;0
//client has played 50% of content
//>>PLAYBACK http://127.0.0.1:6878/content/4c78e1cf0df23b4f5a16a106829ebed710cb52e0/0.673752283974 50
//  <<STATUS main:dl;0;0;145;0;0;7;0;9404416;0;0
//client has played 75% of content
//>>PLAYBACK http://127.0.0.1:6878/content/4c78e1cf0df23b4f5a16a106829ebed710cb52e0/0.673752283974 75
//  <<STATUS main:dl;0;0;146;0;0;7;0;9568256;0;0
//stop content loading
//>>STOP
//<<STATE 0
//disconnect
//>>SHUTDOWN
//<<SHUTDOWN

