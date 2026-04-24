'use strict';

const socket = io();

function decodeHTML(str) {
    const txt = document.createElement("textarea");
    txt.innerHTML = str;
    return txt.value;
}

const playerNameInput = document.getElementById("playerName");
const joinBtn = document.getElementById("joinBtn");
const questionText = document.getElementById("questionText");
const choicesDiv = document.getElementById("choices");
const status = document.getElementById("status");
const startBtn = document.getElementById("startBtn");
const questionProgress = document.getElementById("questionProgress");
const timerFill = document.getElementById("timerFill");

let timerInterval = null;
let currentQuestion = null;
let hasAnswered = false;
let selectedChoiceIndex = null;

joinBtn.addEventListener("click", () => {
    const name = playerNameInput.value.trim();
    socket.emit("registerPlayer", name);
    document.getElementById("joinArea").style.display = "none";
    status.textContent = "Connecté au quiz";
});

socket.on("registered", (player) => {
    status.textContent = `Bienvenue ${player.name}`;

    if (player.isHost) {
        startBtn.style.display = "block";
        status.textContent = `Bienvenue ${player.name} — tu es l'hôte`;
    }
});

socket.on("hostStatus", ({ isHost }) => {
    if (isHost) {
        startBtn.style.display = "block";
        status.textContent = "Tu es maintenant l'hôte";
    }
});

socket.on("newQuestion", (question) => {
    currentQuestion = question;
    hasAnswered = false;
    selectedChoiceIndex = null;

    questionProgress.textContent = `Question ${question.currentQuestionNumber} / ${question.totalQuestions}`;
    questionText.innerHTML = `
        <div class="q-fr">${decodeHTML(question.question.fr)}</div>
        <div class="q-zh">${decodeHTML(question.question.zh)}</div>
      
      `;
    choicesDiv.innerHTML = "";
    status.textContent = "Choisis ta réponse";

    const timerText = document.getElementById("time");

    const radius = 52;
    const circumference = 2 * Math.PI * radius;

    timerFill.style.strokeDasharray = circumference;
    timerFill.style.strokeDashoffset = 0;

    // reset
    clearInterval(timerInterval);
    timerFill.style.strokeDashoffset = 0;

    let timeLeft = question.duration;

    timerInterval = setInterval(() => {
        timeLeft -= 100;

        const percent = Math.max(timeLeft / question.duration, 0);
        const offset = circumference * (1 - percent);

        timerFill.style.strokeDashoffset = offset;

        // texte au centre
        timerText.textContent = Math.ceil(timeLeft / 1000);

        // effet urgence
        if (timeLeft <= 3000) {
            timerFill.style.stroke = "#ff2b2b";
        }

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            timerText.textContent = "0";
        }
    }, 100);

    question.choices.forEach((choice, index) => {
        const btn = document.createElement("button");
        btn.innerHTML = `
           <div class="choice-fr">${decodeHTML(choice.fr)}</div>
  <div class="choice-zh">${decodeHTML(choice.zh)}</div>
        `;

        btn.addEventListener("click", () => {
            if (hasAnswered) return;

            socket.emit("submitAnswer", {
                questionId: question.id,
                choiceIndex: index,
            });

            hasAnswered = true;
            selectedChoiceIndex = index;
            status.textContent = "Réponse envoyée !";

            document.querySelectorAll("#choices button").forEach((b, i) => {
                b.disabled = true;

                if (i === index) {
                    b.classList.add("selected");
                }
            });
        });

        choicesDiv.appendChild(btn);
    });
});

socket.on("revealAnswer", ({ correctIndex }) => {
    clearInterval(timerInterval);
    timerFill.style.width = "0%";

    document.querySelectorAll("#choices button").forEach((btn, index) => {
        btn.disabled = true;

        if (index === correctIndex) {
            btn.classList.add("correct");
        }

        if (index === selectedChoiceIndex && index !== correctIndex) {
            btn.classList.add("incorrect-selected");
        }

        if (
            selectedChoiceIndex !== null &&
            index !== selectedChoiceIndex &&
            index !== correctIndex
        ) {
            btn.classList.add("dimmed");
        }
    });

    if (selectedChoiceIndex === null) {
        status.textContent = "Temps écoulé !";
    } else if (selectedChoiceIndex === correctIndex) {
        status.textContent = "✅ Bonne réponse !";
    } else {
        status.textContent = "❌ Mauvaise réponse !";
    }
});

socket.on("quizEnded", (players) => {
    questionProgress.textContent = `Quiz terminé`;
    questionText.textContent = "🏆 Classement final";
    choicesDiv.innerHTML = "";

    const classement = [...players].sort((a, b) => b.score - a.score);

    choicesDiv.innerHTML = classement
        .map((p, i) => {
            const medals = ["🥇", "🥈", "🥉"];
            const medal = medals[i] || "🎯";

            return `
                  <div class="choice ranking">
                      <span>${medal}</span>
                      ${p.name} — ${p.score} pts
                  </div>
                  `;
        })
        .join("");
});

startBtn.addEventListener("click", () => {
    socket.emit("startQuiz");
    startBtn.style.display = "none";
});