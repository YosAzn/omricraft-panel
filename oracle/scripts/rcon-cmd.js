#!/usr/bin/env node
// Minimal standalone RCON client (Source RCON protocol over raw TCP, no deps).
// Mirrors rconConnect() in manager-api/server.js so create/start and the live
// install endpoint speak the identical protocol. Used by start-server.sh to
// enable datapacks on first boot without any external CLI (no mcrcon on host).
//
// Usage: node rcon-cmd.js <host> <port> <password> <command> [timeoutMs]
// Exit 0 on success (prints response body), non-zero on auth/connection error.
'use strict';
var net = require('net');

var host = process.argv[2];
var port = parseInt(process.argv[3], 10);
var rconPass = process.argv[4];
var command = process.argv[5];
var timeout = parseInt(process.argv[6], 10) || 10000;

if (!host || !port || rconPass === undefined || command === undefined) {
  console.error('Usage: node rcon-cmd.js <host> <port> <password> <command> [timeoutMs]');
  process.exit(2);
}

function rconConnect(host, port, password, command, timeout) {
  timeout = timeout || 10000;
  return new Promise(function(resolve, reject) {
    var socket = new net.Socket();
    var buf = Buffer.alloc(0);
    var authenticated = false;
    var cmdSent = false;
    var timer = setTimeout(function() {
      socket.destroy();
      reject(new Error('RCON connection timed out'));
    }, timeout);

    function buildPacket(id, type, body) {
      var bodyBuf = Buffer.from(body + '\0', 'utf8');
      var len = 4 + 4 + bodyBuf.length + 1;
      var pkt = Buffer.allocUnsafe(4 + len);
      pkt.writeInt32LE(len, 0);
      pkt.writeInt32LE(id, 4);
      pkt.writeInt32LE(type, 8);
      bodyBuf.copy(pkt, 12);
      pkt.writeUInt8(0, 12 + bodyBuf.length);
      return pkt;
    }

    function parsePacket(data) {
      if (data.length < 14) return null;
      var len = data.readInt32LE(0);
      if (data.length < 4 + len) return null;
      var id = data.readInt32LE(4);
      var type = data.readInt32LE(8);
      var body = data.slice(12, 4 + len - 2).toString('utf8');
      return { id: id, type: type, body: body, consumed: 4 + len };
    }

    socket.on('data', function(chunk) {
      buf = Buffer.concat([buf, chunk]);
      while (true) {
        var pkt = parsePacket(buf);
        if (!pkt) break;
        buf = buf.slice(pkt.consumed);
        if (!authenticated) {
          if (pkt.id === -1) {
            clearTimeout(timer);
            socket.destroy();
            return reject(new Error('RCON authentication failed'));
          }
          authenticated = true;
          socket.write(buildPacket(2, 2, command));
          cmdSent = true;
        } else if (cmdSent) {
          clearTimeout(timer);
          socket.destroy();
          resolve(pkt.body);
          return;
        }
      }
    });

    socket.on('error', function(err) { clearTimeout(timer); reject(err); });
    socket.on('close', function() {
      clearTimeout(timer);
      if (!cmdSent) reject(new Error('RCON connection closed early'));
    });
    socket.connect(port, host, function() {
      socket.write(buildPacket(1, 3, password));
    });
  });
}

rconConnect(host, port, rconPass, command, timeout).then(function(body) {
  if (body) process.stdout.write(body);
  process.exit(0);
}).catch(function(err) {
  console.error('RCON error: ' + err.message);
  process.exit(1);
});
