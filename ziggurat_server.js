'use strict';

const express = require('express');
const { Server } = require('ws');

const PORT = process.env.PORT || 3000;
const INDEX = '/index.html';

const server = express()
  .use((req, res) => res.sendFile(INDEX, { root: __dirname }))
  .listen(PORT, () => console.log(`Listening on ${PORT}`));

const wss = new Server({ server });



var players = [];
var hosts = [];

console.log("I LIVE");

wss.on('connection', function connection(ws) {
  console.log("CONNECTION");

  //ws.send("Hello new friend");

  ws.on('message', function incoming(message) {
    //console.log('received: %s', message);

    let msg = JSON.parse(message)
    console.log("i got:"+msg.type);

    //host joining
    if (msg.type === "create_room"){
      let room_id = get_new_room_id();
      let player = {
        is_host : true,
        room_id : room_id,
        ws : ws,
        num_clients : 0
      }
      console.log("created room: "+player.room_id);
      players.push(player);
      hosts.push(player);

      //send confirmation
      player.ws.send("room_created$"+room_id);
    }

    //client joining
    if (msg.type === "join_client"){
      //find the host
      let host = get_host(msg.room);

      if (host == null){
        console.log("can't join client. no host for this room");
        return;
      }

      if (host.num_clients >= 3){
        console.log("can't join client. room is full");
        return;
      }

      host.num_clients++;

      let player = {
        is_host : false,  //msg.is_host == "True",
        room_id : msg.room,
        ws : ws,
        controller_num : host.num_clients
      }
      console.log("new client player here. room:"+player.room_id+"  controller: "+player.controller_num);
      players.push(player);
      console.log("num players:"+players.length);

      //send confirmation
      player.ws.send("client_joined$"+player.controller_num);
    }

    if (msg.type === "board"){
      let room_id = msg.room;
      console.log("got a board for room:"+room_id);

      //find all clients for that room and send it
      //TODO: use get_players
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
      //TODO: use get_players
      //find the host and sent it their way
      players.forEach( player => {
        if (player.room_id == msg.room && player.is_host){
          player.ws.send("input$"+msg.raw_text);
          console.log("sent:"+msg.raw_text);
        }
      })
    }

    if (msg.type === "request_verbose"){
      let host_player = get_host(msg.room);
      if (host_player != null){
        host_player.ws.send("request_verbose");
      }else{
        console.log("no host for room:"+msg.room);
      }
    }

  });


  ws.on('close', function() {
    console.log('Client disconnected');
    //find them and kill them
    for (let i=players.length-1; i>=0; i--){
      if (players[i].ws == ws){
        //if they were the host, remove them from te host list too
        if (players[i].is_host){
          for (let k=hosts.length-1; k>=0; k--){
            if (hosts[k] == players[i]){
              hosts.splice(k,1);
              console.log("  killed host. "+hosts.length+" hosts left remain");
            }
          }
        }

        //rmeove them from players list
        players.splice(i,1);
        console.log("  killed player. "+players.length+" players left remain");
        return;
      }
    }
  });


});

function get_clients(room_id){
  let list = [];
  players.forEach( player => {
    if (player.room_id == room_id && !player.is_host){
      list.push(player);
    }
  })
  return list;
}
function get_host(room_id){
  let val = null
  hosts.forEach( player => {
    if (player.room_id == room_id){
      val = player;
      return val;
    }
  })
  return val;
}


function get_new_room_id(){
  return "test";
}