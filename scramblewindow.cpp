#include "scramblewindow.h"
#include <QString>
#include <QObject>
#include <QMessageBox>
#include <QPushButton>
#include <QHBoxLayout>
#include <QInputDialog>
#include <iostream>
#include <fstream>
#include <utility>
#include <vector>
#include <string>
#include <algorithm>
#include <QCoreApplication>

static std::string leaderboardPath() {
    return (QCoreApplication::applicationDirPath() + "/leaderboard.txt").toStdString();
}

ScrambleWindow::ScrambleWindow(QWidget *parent)
    : QWidget(parent), scramble() {
    if (!scramble.isLoaded()) {
        QMessageBox::critical(this, "Scramble - Data Error",
            QString::fromStdString(scramble.getLoadError()));
        valid = false;
        return;
    }
    scramble.play();

    // Ask for player name at the start
    bool ok;
    QString playerName = QInputDialog::getText(
        this,
        "Player Name",
        "Name?",
        QLineEdit::Normal,
        "",
        &ok
    );
    
    if (!ok || playerName.isEmpty()) {
        valid = false;
        return;
    }
    
    this->playerName = playerName;
    
    layout = new QVBoxLayout(this);
    QHBoxLayout *headerLayout = new QHBoxLayout();
    infoLabel = new QLabel(this);
    scoreLabel = new QLabel("Score: " + QString::number(scramble.getTotalScore()), this);
    QPushButton *restartButton = new QPushButton("Restart", this);
    QPushButton *skipButton = new QPushButton("Skip", this);
    
    headerLayout->addWidget(infoLabel);
    headerLayout->addStretch();
    headerLayout->addWidget(restartButton);
    headerLayout->addStretch();
    headerLayout->addWidget(skipButton);
    headerLayout->addStretch();
    headerLayout->addWidget(scoreLabel);
    
    
    layout->addLayout(headerLayout);

    QObject::connect(restartButton, &QPushButton::clicked, [this]() {
        restart();
    });

    currentInputIndex = 0; // Initialize the current input index

    QObject::connect(skipButton, &QPushButton::clicked, [this](){
        skip();
    });

    for (int i = 0; i < 25; i++) {
        QLineEdit *playerInput = new QLineEdit(this);
        QLabel *yardLabel = new QLabel(this);

        QHBoxLayout *rowLayout = new QHBoxLayout();
        rowLayout->addWidget(playerInput);
        rowLayout->addWidget(yardLabel);
        layout->addLayout(rowLayout);
        
        yardLabels.push_back(yardLabel);
        playerInputs.push_back(playerInput);

        if (i != 0) {
            playerInput->setEnabled(false);
        } else {
            playerInput->setPlaceholderText(QString::fromStdString(scramble.getActiveTeam().getName()));
        }

        QObject::connect(playerInput, &QLineEdit::returnPressed, [this, playerInput, yardLabel, i]() {
            if (i >= playerInputs.size())
                return;
            if (playerInput->text().isEmpty()) {
                skip();
                return;
            }
            std::string currentTeamName = scramble.getActiveTeam().getName();
            std::string ans = playerInput->text().toStdString();
            std::transform(ans.begin(), ans.end(), ans.begin(),[](unsigned char c){ return std::tolower(c); });
            std::pair<bool, std::string> result = scramble.checkAns(ans);
            std::string message = "";
            
            if (result.first) {
                int yards = scramble.addYards(ans);
                playerInput->setEnabled(false);
                yardLabel->setText(QString::number(yards) + " " + QString::fromStdString(currentTeamName));
                if (i + 1 < playerInputs.size()) {
                    currentInputIndex++;
                    playerInputs[i + 1]->setEnabled(true);
                    playerInputs[i + 1]->setFocus();
                    playerInputs[i + 1]->setPlaceholderText(QString::fromStdString(scramble.getActiveTeam().getName()));
                }
                scoreLabel->setText("Score: " + QString::number(scramble.getTotalScore()));

                // Show menu at the end
                if (i+1 == playerInputs.size()) {
                    std::fstream leader(leaderboardPath());
                    int finalScore = scramble.getTotalScore();
                    std::pair<std::string, int> entry;
                    std::vector<std::pair<std::string, int>> leaderboard;

                    leaderboard.clear();

                    while (leader >> entry.first >> entry.second) {
                        leaderboard.push_back(entry);
                    }

                    leaderboard.push_back({this->playerName.toStdString() , finalScore});

                    std::sort(leaderboard.begin(), leaderboard.end(), [](const auto &a, const auto &b) {
                        return a.second > b.second;
                    });

                    // Keep only the top 10 (sorted descending), preserving this run.
                    const size_t maxEntries = 10;
                    if (leaderboard.size() > maxEntries)
                        leaderboard.resize(maxEntries);
                    leader.close();

                    std::ofstream out(leaderboardPath(), std::ios::trunc);
                        for (const auto &entry : leaderboard) {
                            out << entry.first << " " << entry.second << "\n";
                        }
                    out.close();
                    
                    
                    playerInput->setEnabled(false);
                    
                    // Create custom dialog with three buttons
                    QMessageBox gameOverBox(
                        QMessageBox::Information,
                        "Game Over",
                        "Game Over!\nYour Score: " + QString::number(scramble.getTotalScore()),
                        QMessageBox::NoButton,
                        this
                    );
                    
                    QPushButton *restartBtn = gameOverBox.addButton("Restart", QMessageBox::ActionRole);
                    QPushButton *leaderboardBtn = gameOverBox.addButton("View Leaderboard", QMessageBox::ActionRole);
                    QPushButton *closeBtn = gameOverBox.addButton("Close", QMessageBox::ActionRole);
                    
                    gameOverBox.exec();
                    
                    if (gameOverBox.clickedButton() == restartBtn) {
                        restart();
                        for (auto* input : playerInputs) input->blockSignals(false);
                    } else if (gameOverBox.clickedButton() == leaderboardBtn) {
                        // Display leaderboard in a message box
                        QString leaderboardText = "LEADERBOARD\n\n";
                        for (int j = 0; j < leaderboard.size(); ++j) {
                            leaderboardText += QString::number(j + 1) + ". " + 
                                             QString::fromStdString(leaderboard[j].first) + " - " + 
                                             QString::number(leaderboard[j].second) + "\n";
                        }
                        
                        QMessageBox::information(this, "Leaderboard", leaderboardText);
                        
                        // After viewing leaderboard, ask again if they want to restart
                        int ret = QMessageBox::question(
                            this,
                            "Game Over",
                            "Restart?",
                            QMessageBox::Yes | QMessageBox::No
                        );
                        if (ret == QMessageBox::Yes) {
                            restart();
                            for (auto* input : playerInputs) input->blockSignals(false);
                        } else {
                            close();
                        }
                    } else {
                        close();
                    }
                    return;
                }
            } else {playerInput->clear();}
            
            infoLabel->setText(QString::fromStdString(result.second)+QString::fromStdString(message));
        });
    }
    if (!playerInputs.empty())
        playerInputs[0]->setFocus();
    setLayout(layout);
    setWindowTitle("Scramble");
    resize(800, 600);
    
}

void ScrambleWindow::restart() {
    scramble.reset();
    scramble.play();
    for (int i = 0; i < playerInputs.size(); ++i) {
        playerInputs[i]->clear();
        playerInputs[i]->setEnabled(i == 0);
        playerInputs[i]->setPlaceholderText(i == 0 ? QString::fromStdString(scramble.getActiveTeam().getName()) : "");
        yardLabels[i]->clear();
    }
    currentInputIndex = 0; // Reset the current input index
    if (!playerInputs.empty())
        playerInputs[0]->setFocus();
    infoLabel->clear();
    scoreLabel->setText("Score: 0");
}

void ScrambleWindow::skip(){
    if (currentInputIndex >= playerInputs.size()) return;
        
        int i = currentInputIndex;
        scramble.nextTurn();
        playerInputs[i]->setEnabled(false);
        yardLabels[i]->setText("Skipped");
        
        if (i + 1 < playerInputs.size()) {
            currentInputIndex++;
            playerInputs[i + 1]->setEnabled(true);
            playerInputs[i + 1]->setFocus();    
            playerInputs[i + 1]->setPlaceholderText(QString::fromStdString(scramble.getActiveTeam().getName()));
        } else {
            // Game over - show end dialog with leaderboard button
            std::ifstream leader(leaderboardPath());
            int finalScore = scramble.getTotalScore();
            std::pair<std::string, int> entry;
            std::vector<std::pair<std::string, int>> leaderboard;

            leaderboard.clear();

            while (leader >> entry.first >> entry.second) {
                leaderboard.push_back(entry);
            }

            leaderboard.push_back({this->playerName.toStdString(), finalScore});

            std::sort(leaderboard.begin(), leaderboard.end(), [](const auto &a, const auto &b) {
                return a.second > b.second;
            });

            // Keep only the top 10 (sorted descending), preserving this run.
            const size_t maxEntries = 10;
            if (leaderboard.size() > maxEntries)
                leaderboard.resize(maxEntries);
            // Overwrite the leaderboard file with the new sorted contents
            leader.close();
            
            std::ofstream out(leaderboardPath(), std::ios::trunc);
            for (const auto &entry : leaderboard) {
                out << entry.first << " " << entry.second << "\n";
            }
            out.close();
            
            

            QMessageBox gameOverBox(
                QMessageBox::Information,
                "Game Over",
                "Game Over!\nYour Score: " + QString::number(scramble.getTotalScore()),
                QMessageBox::NoButton,
                this
            );

            QPushButton *restartBtn = gameOverBox.addButton("Restart", QMessageBox::ActionRole);
            QPushButton *leaderboardBtn = gameOverBox.addButton("View Leaderboard", QMessageBox::ActionRole);
            QPushButton *closeBtn = gameOverBox.addButton("Close", QMessageBox::ActionRole);

            gameOverBox.exec();

            if (gameOverBox.clickedButton() == restartBtn) {
                restart();
            } else if (gameOverBox.clickedButton() == leaderboardBtn) {
                QString leaderboardText = "LEADERBOARD\n\n";
                for (int j = 0; j < leaderboard.size(); ++j) {
                    leaderboardText += QString::number(j + 1) + ". " + 
                                     QString::fromStdString(leaderboard[j].first) + " - " + 
                                     QString::number(leaderboard[j].second) + "\n";
                }

                QMessageBox::information(this, "Leaderboard", leaderboardText);

                int ret = QMessageBox::question(
                    this,
                    "Game Over",
                    "Restart?",
                    QMessageBox::Yes | QMessageBox::No
                );
                if (ret == QMessageBox::Yes) {
                    restart();
                } else {
                    close();
                }
            } else {
                close();
            }
            
            return;
        }
    infoLabel->setText("Skipped!");
}

bool ScrambleWindow::isValid() const { return valid; }