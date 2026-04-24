'use strict';

const socket = io();

function decodeHTML(str) {
    const txt = document.createElement("textarea");
    txt.innerHTML = str;
    return txt.value;
}

const playersList = document.getElementById("playersList");
const questionText = document.getElementById("questionText");
const choicesDiv = document.getElementById("choices");
const answersInfo = document.getElementById("answersInfo");
const timerFill = document.getElementById("timerFill");
const questionProgress = document.getElementById("questionProgress");
let timerInterval = null;
let totalPlayers = 0;

socket.emit("registerHost");

socket.on("playersList", (players) => {
    playersList.innerHTML = "";
    totalPlayers = players.length;

    players.forEach((player) => {
        const li = document.createElement("li");
        li.textContent = `👾 ${player.name} — ${player.score} pt`;
        playersList.appendChild(li);
    });
});

socket.on("newQuestion", (question) => {
    questionProgress.textContent = `Question ${question.currentQuestionNumber} / ${question.totalQuestions}`;
    questionText.innerHTML = `
  <div class="q-fr">${decodeHTML(question.question.fr)}</div>
  <div class="q-zh">${decodeHTML(question.question.zh)}</div>
`;
    choicesDiv.innerHTML = "";
    answersInfo.textContent = `0 / ${totalPlayers} réponse(s) reçue(s)`;

    console.log("nouvelle question", question);

    const timerFill = document.getElementById("timerFill");
    const timerText = document.getElementById("timerText");

    const radius = 52;
    const circumference = 2 * Math.PI * radius;

    timerFill.style.strokeDasharray = circumference;
    timerFill.style.strokeDashoffset = 0;

    // reset timer
    clearInterval(timerInterval);
    timerFill.style.strokeDashoffset = 0;

    let timeLeft = question.duration;

    timerInterval = setInterval(() => {
        timeLeft -= 100;

        const percent = Math.max(timeLeft / question.duration, 0);
        const offset = circumference * (1 - percent);

        timerFill.style.strokeDashoffset = offset;
        timerText.textContent = Math.ceil(timeLeft / 1000);

        if (timeLeft <= 3000) {
            timerFill.style.stroke = "#ff2b2b";
        } else {
            timerFill.style.stroke = "#ffd21a";
        }

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            timerText.textContent = "0";
        }
    }, 100);

    question.choices.forEach((choice, index) => {
        const div = document.createElement("div");
        div.className = "choice";
        div.dataset.index = index;
        div.innerHTML = `
    <div class="choice-fr">${decodeHTML(choice.fr)}</div>
  <div class="choice-zh">${decodeHTML(choice.zh)}</div>
  `;
        choicesDiv.appendChild(div);
    });
});

socket.on("answersCount", ({ totalPlayers, totalAnswers }) => {
    answersInfo.textContent = `${totalAnswers} / ${totalPlayers} réponse(s) reçue(s)`;
});

socket.on("revealAnswer", ({ correctIndex, players }) => {
    clearInterval(timerInterval);

    document.querySelectorAll(".choice").forEach((el) => {
        const i = Number(el.dataset.index);

        if (i === correctIndex) {
            el.classList.add("correct");
        } else {
            el.classList.add("wrong");
        }
    });
});

socket.on("quizEnded", (players) => {
    questionProgress.textContent = `Terminé`;
    questionText.textContent = "Quiz terminé !";
    choicesDiv.innerHTML = "";

    const classement = [...players].sort((a, b) => b.score - a.score);
    answersInfo.innerHTML =
        "<strong>Classement final</strong><br><br>" +
        classement
            .map((p, i) => `${i + 1}. ${p.name} — ${p.score} pt`)
            .join("<br>");

    startBtn.style.display = "inline-block";
});