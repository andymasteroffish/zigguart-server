'use strict';

const express = require('express');
const { Server } = require('ws');

const PORT = process.env.PORT || 3000;
const INDEX = '/index.html';

const server = express()
  .use((req, res) => res.sendFile(INDEX, { root: __dirname }))
  .listen(PORT, () => console.log(`Listening on ${PORT}`));

const wss = new Server({ server });






// const WebSocket = require('ws');

// //heroku will force this to be port 80
// const PORT = process.env.PORT || 3001;

// const wss = new WebSocket.Server({ port: PORT }, () => {
//   console.log('listening on '+PORT);
// });

var players = [];

console.log("I LIVE");

wss.on('connection', function connection(ws) {
  console.log("CONNECTION");

  //ws.send("Hello new friend");

  ws.on('message', function incoming(message) {
    //console.log('received: %s', message);

    let msg = JSON.parse(message)
    console.log("i got:"+msg.type);

    if (msg.type === "join"){
      
      let player = {
        is_host : msg.is_host == "True",
        room_id : msg.room,
        ws : ws
      }
      console.log("new player here. host:"+player.is_host+"  room:"+player.room_id);
      players.push(player);
      console.log("num players:"+players.length);
    }

    if (msg.type === "board"){
      let room_id = msg.room;
      console.log("got a board for room:"+room_id);

      //find all clients for that room and send it
      let test_count = 0;
      players.forEach( player => {
        if (player.room_id == room_id && !player.is_host){
          player.ws.send("board$"+msg.raw_text);
          test_count++;
        }
      })
      console.log("sent board to "+test_count+" clients");

    }

    if (msg.type === "input"){
      //find the host and sent it their way
      players.forEach( player => {
        if (player.room_id == msg.room && player.is_host){
          player.ws.send("input$"+msg.raw_text);
          console.log("sent:"+msg.raw_text);
        }
      })
    }

    /*
    for (var i = 0; i < clients.length; i++) {
      //console.log(clients[i])

      //clients[i] != ws so we don't repeat messages back to the sender
      if(clients[i].readyState === 1 && clients[i] != ws){
        clients[i].send(message);
      }
    }
    */
  });


  ws.on('close', function() {
    console.log('Client disconnected');
    //find them and kill them
    for (let i=players.length-1; i>=0; i--){
      if (players[i].ws == ws){
        players.splice(i,1);
        console.log("  "+players.length+" players left remain");
        return;
      }
    }
  });


});

//NEED A CLIENT DISCONNECT FUNCTION!!!