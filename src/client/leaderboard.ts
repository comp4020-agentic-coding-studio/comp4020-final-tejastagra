// The leaderboard screen (/leaderboard): most wins and fewest rounds to win,
// as two lists (R38, R39). The server computes both; this only shows them.
import { $, fillList, loadBoard } from "./common.ts";

const message = document.getElementById("board-message")!;
loadBoard(20).then((board) => {
  if (!board) {
    message.textContent = "Could not load the leaderboard. Try again.";
    message.dataset.kind = "error";
    return;
  }
  fillList($("leaderboard-wins"), board.wins, "win", "No wins yet.");
  fillList($("leaderboard-rounds"), board.rounds, "round", "No wins by four in a row yet.");
});
