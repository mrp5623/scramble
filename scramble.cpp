#include "scramble.h"
#include <random>
#include <algorithm>
#include <QCoreApplication>
#include <QFile>
#include <QByteArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonParseError>
#include <QString>

Scramble::Scramble() {
    QString path = QCoreApplication::applicationDirPath() + "/data/nfl_qbs.json";
    QFile file(path);
    if (!file.open(QIODevice::ReadOnly)) {
        loadError = "Could not open data file:\n" + path.toStdString() +
                    "\n\nRun tools/update_stats.py to generate it.";
        return;
    }
    QByteArray bytes = file.readAll();
    file.close();

    QJsonParseError perr;
    QJsonDocument doc = QJsonDocument::fromJson(bytes, &perr);
    if (doc.isNull() || !doc.isObject()) {
        loadError = "Invalid data file: " + perr.errorString().toStdString();
        return;
    }

    QJsonObject root = doc.object();
    for (auto it = root.begin(); it != root.end(); ++it) {
        std::string code = it.key().toStdString();
        QJsonObject teamObj = it.value().toObject();
        TeamData td;
        td.displayName = teamObj.value("display_name").toString().toStdString();
        QJsonObject qbs = teamObj.value("qbs").toObject();
        for (auto q = qbs.begin(); q != qbs.end(); ++q) {
            std::string qb = q.key().toStdString();
            td.players.push_back(qb);
            qbYards[qb] = q.value().toInt();
        }
        teams[code] = std::move(td);
        teamCodes.push_back(code);
    }

    if (teamCodes.empty()) {
        loadError = "Data file contained no teams.";
        return;
    }
    loaded = true;
}

bool Scramble::isLoaded() const { return loaded; }

std::string Scramble::getLoadError() const { return loadError; }

void Scramble::play() {
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<> distrib(0, static_cast<int>(teamCodes.size()) - 1);
    chosen.clear();
    for (int i = 0; i < 25; i++) {
        chosen.push_back(teamCodes[distrib(gen)]);
    }
    turn = 0;
    const TeamData& td = teams[chosen[0]];
    activeTeam = Team(td.displayName, td.players);
}

std::pair<bool, std::string> Scramble::checkAns(const std::string& guess) {
    std::vector<std::string> playersList = activeTeam.getPlayerList();

    if (std::find(playersList.begin(), playersList.end(), guess) == playersList.end()) {
        return {false, "Incorrect, Try Again!"};
    } else if (std::find(guessed.begin(), guessed.end(), guess) != guessed.end()) {
        return {false, "Already Guessed, Try Again!"};
    } else {
        guessed.push_back(guess);
        nextTurn();
        return {true, "Correct!"};
    }
}

int Scramble::addYards(const std::string& player) {
    // A validated guess is always present in the map; 0 is a defensive default.
    int yards = 0;
    auto it = qbYards.find(player);
    if (it != qbYards.end()) {
        yards = it->second;
    }
    totalScore += yards;
    return yards;
}

void Scramble::nextTurn() {
    if (turn < static_cast<int>(chosen.size()) - 1) {
        turn++;
        const TeamData& td = teams[chosen[turn]];
        activeTeam = Team(td.displayName, td.players);
    }
}

Team Scramble::getActiveTeam() const {
    return activeTeam;
}

int Scramble::getTotalScore() const {
    return totalScore;
}

void Scramble::reset() {
    totalScore = 0;
    chosen.clear();
    guessed.clear();
    turn = 0;
}
