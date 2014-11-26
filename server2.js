/*
To Do:
Mouseover on cards is too slow
Option to view 'won' black cards? (how to display?)
	judge cards stick around
Add a max thing to screen size
show judging cards on other screens
*bug* black cards don't clear out and stay on screen
3rd card in 4th set while judging doesn't fit onscreen
*/

var express = require('express');
var app = express()
  , server = require('http').createServer(app)
  , io = require('socket.io').listen(server);
var mysql = require('mysql');

var connection = mysql.createConnection({
  host     : 'localhost',
  user     : 'root',
  password : '',
});

app.use("/javascript", express.static(__dirname + '/javascript'));
app.use("/images", express.static(__dirname + '/images'));

server.listen(8080);

app.get('/', function (req, res) {
  res.sendfile(__dirname + '/index.html');
});

var handSize = 7;

var players = [];
var judge = -1;
var currBlack;

var gameScore = 0;

var availableBlack = [];
var availableWhite = [];

var end = false;

connection.connect();

//connect to db
connection.query('USE cah');

//get max white cards
connection.query('SELECT id FROM white_cards', function(err, rows, fields) {
  if (err) throw err;
  for (var i = 0; i < rows.length; i++) {
  	availableWhite.push(rows[i].id);
  }
});

//get max black cards
connection.query('SELECT id FROM black_cards', function(err, rows, fields) {
  if (err) throw err;
  for (var i = 0; i < rows.length; i++) {
  	availableBlack.push(rows[i].id);
  }
});


//get index of players item with matching attribute value
function getByAttr(list, attr, value) {
	for (var i = 0; i < list.length; i++) {
		if (list[i][attr] == value) {
			return i;
		}
	}
	return -1;
}

//get list of player object attributes
function getAttrs(list, attr) {
	var attrList = [];
	for (var i = 0; i < list.length; i++) {
		attrList.push(list[i][attr]);
	}
	return attrList;
}

function drawBlack(callback) {
	//currBlack = {text: "Make a Haiku.", blanks: 3}
	//callback();
	//return;
	
	if (availableBlack.length == 0) {
		console.log("Out of black cards!");
		callback();
		return;
	}
	
	var ind = Math.floor((Math.random()*availableBlack.length));
	var id = availableBlack[ind];
	availableBlack.splice(ind,1);
	//console.log("Getting black card " + id);
	
	var text;
	var blanks;
	
	connection.query('SELECT * FROM black_cards WHERE id=' + id, function(err, rows, fields) {
	  	if (err) throw err;
		currBlack = {text:rows[0].text, blanks:rows[0].blanks}
		callback();
	});
}

function drawWhite(num, cards, callback) {
	for (var i = 0; i < num; i++) {
		
		if (availableWhite.length == 0) {
			//wait a sec for the queries to collect then return
			console.log("Out of white cards!");
			setTimeout(callback, 300);
			return;
		}
		
		var ind = Math.floor((Math.random()*availableWhite.length));
		var id = availableWhite[ind];
		availableWhite.splice(ind,1);
		
		//console.log(availableWhite.length + ", " + ind + ", " + id);
		
		(function(last) {
			connection.query('SELECT * FROM white_cards WHERE id=' + id, function(err, rows, fields) {
		  		if (err) throw err;
		  		cards.push({text:rows[0].text});
		  		
		  		if (last) {
		  			callback();
		  		}
			});
		})(i == num - 1)
	}
}

function endGame() {
	//send scores for all players to everyone
	end = true;
  	io.sockets.emit("end", {players: players, game: gameScore});
  	connection.end();
}

io.sockets.on('connection', function (socket) {
  
  //let the client know we're connected
  socket.emit('handshake', { handSize: handSize });
  
  //the client came back after the handshake so we are in business
  socket.on('join', function (data) {
  	if (!end) {
		if (getByAttr(players, "name", data.name) == -1) {
			
			//draw the new player some cards
			var cards = [];
			drawWhite(handSize, cards, function() {
				
				//create new 'player' object
				players.push({name: data.name, score: 0, played: [], hand: cards});
				
				//if there isn't a judge yet, make it this player (the first to join)
				if (judge < 0) {
					judge = players.length - 1;
					
					//draw a black card
					drawBlack(function() {
						socket.emit("start", {judge: judge, card: currBlack, players: players});
					});
				} else {
					socket.emit("start", {judge: judge, card: currBlack, players: players});
				}
			});
				
			console.log("player " + data.name + " joined the game");
			
			//emit message to all other connections to let them know someone joined
			socket.broadcast.emit("joined", data);
	
		} else {
			console.log("player " + data.name + " rejoined the game");	
			socket.emit("start", {judge: judge, card: currBlack, players: players});
		}
	}
  });
  
  function checkRound() {
  	//check if everyone has played (except the judge)
	var roundTest = true;
	for (var i = 0; i < players.length; i++) {
		if (i != judge) {
			roundTest = roundTest && (players[i].played.length > 0);
		}
	}
	
	return roundTest;
  }
  
  function endRound() {
	//add random card(s) for game then emit to players
	var cards = [];
	drawWhite(currBlack.blanks, cards, function() {
		players[judge].played = cards;
		var played = getAttrs(players, "played");
		io.sockets.emit("round_end", {played: played});
	});
  }
  
  //when a user plays card(s)
  socket.on('play', function(data) {
  	if (!end) {
		//store card(s) user played
		players[getByAttr(players, "name", data.name)].played = data.played;
		
		//let the other players know card(s) was played
		socket.broadcast.emit("play", data);
		
		//send new card(s) back to player
		setTimeout(function() {
			var cards = [];
			drawWhite(data.played.length, cards, function() {
				socket.emit("draw", cards);
			});
		}, 2000);
		
		if (checkRound()) {
			endRound();
		}
	}
  });
  
  socket.on('judge_end', function(data) {
  	if (!end) {
		//find out who won and give them a point
		var winner;
		for (var i = 0; i < players.length; i++) {
			if (players[i].played[0] && players[i].played[0].text == data[0].text) {
				if (i != judge) {
					players[i].score++;
					winner = players[i].name;
				} else {
					gameScore++;
					winner = "\"The Game\"";
				}
			}
			players[i].played = [];
		}
		io.sockets.emit("judge_end", {winner: winner, winnerCards: data});
		
		if (availableWhite.length > 0 && availableBlack.length > 0) {
			//start new round with new judge
			judge = (judge + 1) % players.length;
			
			drawBlack(function() {
				setTimeout(function() {
					io.sockets.emit("round_start", {judge: players[judge].name, card: currBlack});
				}, 3000);
			});
		} else {
			endGame();
		}
	}
  });
  
  socket.on('end', function(data) {
  	endGame();
  });
  
  socket.on('quit', function(data) {
  	
  	var quitInd = getByAttr(players, "name", data.name);
  	
  	//judge shouldn't be able to quit, just ignore it if they do it anyway somehow
  	//also ignore if judging is currently going on
  	if (quitInd != judge && !checkRound()) {
  		//let everyone know they quit
  		socket.broadcast.emit("quit", data);
  		
  		//remove player
  		players.splice(getByAttr(players, "name", data.name), 1);
  		
  		console.log("players now: " + getAttrs(players, "name"));
  		
  		//make sure we still have the right judge recorded
  		if (quitInd < judge) {
  			judge -= 1;
  		}
  		
  		//if everyone was waiting on them, then end the round and start judging
  		if (checkRound()) {
  			endRound();
  		}
  	}
  });
  
  socket.on('confirm_draw', function(data) {
  	if (!end) {
		console.log("updated " + data.name + "'s hand");
		players[getByAttr(players, "name", data.name)].hand = data.cards;
	}
  });
});