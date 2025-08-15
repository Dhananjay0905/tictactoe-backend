const games = {}; // In-memory store for active games

function initializeSocket(io) {
  io.on("connection", (socket) => {
    // --- DEBUG LOG ---
    console.log(`[Socket.io] User connected: ${socket.id}`);

    // Create a new game
    socket.on("createGame", (data) => {
      // --- DEBUG LOG ---
      console.log(
        `[Socket.io] 'createGame' event received from ${socket.id} with data:`,
        data
      );

      const gameId = Math.random().toString(36).substring(2, 8);
      games[gameId] = {
        players: [{ id: socket.id, symbol: data.symbol }],
        board: Array(9).fill(null),
        currentPlayer: data.symbol, // Player who creates the game starts
        gameMode: data.gameMode,
        difficulty: data.difficulty,
      };
      socket.join(gameId);

      // --- DEBUG LOG ---
      console.log(
        `[Socket.io] Game ${gameId} created. Emitting 'gameCreated' to ${socket.id}`
      );
      socket.emit("gameCreated", { gameId, gameState: games[gameId] });
    });

    // Join an existing game
    socket.on("joinGame", (data) => {
      // --- DEBUG LOG ---
      console.log(
        `[Socket.io] 'joinGame' event received from ${socket.id} with data:`,
        data
      );

      const { gameId } = data;
      const game = games[gameId];

      if (game && game.players.length === 1) {
        const player1Symbol = game.players[0].symbol;
        const player2Symbol = player1Symbol === "X" ? "O" : "X";
        game.players.push({ id: socket.id, symbol: player2Symbol });
        socket.join(gameId);

        // --- DEBUG LOG ---
        console.log(
          `[Socket.io] Player ${socket.id} joined game ${gameId}. Emitting 'gameUpdate' to room.`
        );
        io.to(gameId).emit("gameUpdate", game);
        io.to(gameId).emit(
          "message",
          `Player ${socket.id} has joined the game.`
        );
      } else {
        // --- DEBUG LOG ---
        console.log(`[Socket.io] Error: Game ${gameId} not found or is full.`);
        socket.emit("error", "Game not found or is full.");
      }
    });

    // Handle a player's move
    socket.on("makeMove", (data) => {
      const { gameId, index, playerSymbol } = data;
      const game = games[gameId];

      if (
        !game ||
        game.board[index] !== null ||
        game.currentPlayer !== playerSymbol
      ) {
        // Invalid move
        console.log(
          `[Socket.io] Invalid move attempted in game ${gameId} by ${playerSymbol}`
        );
        return;
      }

      game.board[index] = playerSymbol;
      const winner = checkWinner(game.board);

      if (winner) {
        game.winner = winner;
        io.to(gameId).emit("gameOver", game);
        delete games[gameId]; // Clean up finished game
      } else if (game.board.every((cell) => cell !== null)) {
        game.winner = "draw";
        io.to(gameId).emit("gameOver", game);
        delete games[gameId];
      } else {
        // Switch player
        game.currentPlayer = game.currentPlayer === "X" ? "O" : "X";
        io.to(gameId).emit("gameUpdate", game);

        // If it's AI's turn
        if (
          game.gameMode === "ai" &&
          game.currentPlayer !== game.players[0].symbol
        ) {
          setTimeout(() => {
            aiMove(game, gameId, io);
          }, 500); // AI "thinks" for a bit
        }
      }
    });

    socket.on("disconnect", () => {
      // --- DEBUG LOG ---
      console.log(`[Socket.io] User disconnected: ${socket.id}`);
      // Find and handle game abandonment
      for (const gameId in games) {
        const game = games[gameId];
        const player = game.players.find((p) => p.id === socket.id);
        if (player) {
          console.log(
            `[Socket.io] Player ${socket.id} left game ${gameId}. Notifying room.`
          );
          io.to(gameId).emit("playerLeft", {
            message: "The other player has left the game.",
          });
          delete games[gameId]; // End the game
          break;
        }
      }
    });
  });
}

function checkWinner(board) {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8], // rows
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8], // columns
    [0, 4, 8],
    [2, 4, 6], // diagonals
  ];
  for (let i = 0; i < lines.length; i++) {
    const [a, b, c] = lines[i];
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  return null;
}

function aiMove(game, gameId, io) {
  const aiSymbol = game.currentPlayer;
  let move;

  switch (game.difficulty) {
    case "easy":
      move = getEasyMove(game.board);
      break;
    case "medium":
      move = getMediumMove(game.board, aiSymbol);
      break;
    case "hard":
      move = getHardMove(game.board, aiSymbol);
      break;
    default:
      move = getEasyMove(game.board);
  }

  if (move !== null) {
    game.board[move] = aiSymbol;
    const winner = checkWinner(game.board);

    if (winner) {
      game.winner = winner;
      io.to(gameId).emit("gameOver", game);
      delete games[gameId];
    } else if (game.board.every((cell) => cell !== null)) {
      game.winner = "draw";
      io.to(gameId).emit("gameOver", game);
      delete games[gameId];
    } else {
      game.currentPlayer = game.currentPlayer === "X" ? "O" : "X";
      io.to(gameId).emit("gameUpdate", game);
    }
  }
}

// --- AI Logic ---

// Easy: Makes a random valid move.
function getEasyMove(board) {
  const availableMoves = board
    .map((val, idx) => (val === null ? idx : null))
    .filter((val) => val !== null);
  if (availableMoves.length > 0) {
    return availableMoves[Math.floor(Math.random() * availableMoves.length)];
  }
  return null;
}

// Medium: Tries to win, then tries to block, otherwise random.
function getMediumMove(board, aiSymbol) {
  const opponentSymbol = aiSymbol === "X" ? "O" : "X";

  // 1. Check if AI can win in the next move
  for (let i = 0; i < board.length; i++) {
    if (board[i] === null) {
      const boardCopy = [...board];
      boardCopy[i] = aiSymbol;
      if (checkWinner(boardCopy) === aiSymbol) {
        return i;
      }
    }
  }

  // 2. Check if the opponent can win in the next move, and block them
  for (let i = 0; i < board.length; i++) {
    if (board[i] === null) {
      const boardCopy = [...board];
      boardCopy[i] = opponentSymbol;
      if (checkWinner(boardCopy) === opponentSymbol) {
        return i;
      }
    }
  }

  // 3. Otherwise, make a random move
  return getEasyMove(board);
}

// Hard: Uses the Minimax algorithm.
function getHardMove(board, aiSymbol) {
  const bestMove = minimax(board, aiSymbol);
  return bestMove.index;
}

function minimax(newBoard, player) {
  const huPlayer = games[Object.keys(games)[0]].players[0].symbol; // Assuming first player is human
  const aiPlayer = huPlayer === "X" ? "O" : "X";

  const availSpots = newBoard
    .map((val, idx) => (val === null ? idx : null))
    .filter((val) => val !== null);

  if (checkWinner(newBoard) === huPlayer) {
    return { score: -10 };
  } else if (checkWinner(newBoard) === aiPlayer) {
    return { score: 10 };
  } else if (availSpots.length === 0) {
    return { score: 0 };
  }

  const moves = [];
  for (let i = 0; i < availSpots.length; i++) {
    const move = {};
    move.index = availSpots[i];
    newBoard[availSpots[i]] = player;

    if (player === aiPlayer) {
      const result = minimax(newBoard, huPlayer);
      move.score = result.score;
    } else {
      const result = minimax(newBoard, aiPlayer);
      move.score = result.score;
    }

    newBoard[availSpots[i]] = null; // reset the spot
    moves.push(move);
  }

  let bestMove;
  if (player === aiPlayer) {
    let bestScore = -10000;
    for (let i = 0; i < moves.length; i++) {
      if (moves[i].score > bestScore) {
        bestScore = moves[i].score;
        bestMove = i;
      }
    }
  } else {
    let bestScore = 10000;
    for (let i = 0; i < moves.length; i++) {
      if (moves[i].score < bestScore) {
        bestScore = moves[i].score;
        bestMove = i;
      }
    }
  }
  return moves[bestMove];
}

module.exports = initializeSocket;
