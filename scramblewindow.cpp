#include "scramblewindow.h"
#include <QString>
#include <QObject>
#include <QMessageBox>
#include <QPushButton>
#include <iostream>

ScrambleWindow::ScrambleWindow(QWidget *parent)
    : QWidget(parent), scramble() {
    scramble.play();
    layout = new QVBoxLayout(this);
    QHBoxLayout *headerLayout = new QHBoxLayout();
    infoLabel = new QLabel(this);
    scoreLabel = new QLabel("Score: " + QString::number(scramble.getTotalScore()), this);
    QPushButton *restartButton = new QPushButton("Restart", this);
    
    headerLayout->addWidget(infoLabel);
    headerLayout->addStretch();
    headerLayout->addWidget(restartButton);
    headerLayout->addStretch();
    headerLayout->addWidget(scoreLabel);
    
    
    layout->addLayout(headerLayout);

    QObject::connect(restartButton, &QPushButton::clicked, [this]() {
        restart();
    });

    for (int i = 0; i < 20; i++) {
        QLineEdit *playerInput = new QLineEdit(this);
        
        QLabel *yardLabel = new QLabel(this);
        //yardLabel->setMidLineWidth(80);

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
            std::string currentTeamName = scramble.getActiveTeam().getName();
            std::pair<bool, std::string> result = scramble.checkAns(playerInput->text().toStdString());
            std::string message = "";
            
            if (result.first) {
                int yards = scramble.addYards(playerInput->text().toStdString());
                if(yards==5000) message = "\nMininum Yards Applied";
                playerInput->setEnabled(false);
                yardLabel->setText(QString::number(yards) + " " + QString::fromStdString(currentTeamName));
                if (i + 1 < playerInputs.size()) {
                    playerInputs[i + 1]->setEnabled(true);
                    playerInputs[i + 1]->setFocus();
                    playerInputs[i + 1]->setPlaceholderText(QString::fromStdString(scramble.getActiveTeam().getName()));
                }
                scoreLabel->setText("Score: " + QString::number(scramble.getTotalScore()));

                // Show menu at the end
                if (i+1 == playerInputs.size()) {
                    playerInput->setEnabled(false);
                    int ret = QMessageBox::question(
                        this,
                        "Game Over",
                        "Game Over!\nYour Score: " + QString::number(scramble.getTotalScore()) + "\n\nRestart?",
                        QMessageBox::Yes | QMessageBox::No
                    );
                    if (ret == QMessageBox::Yes) {
                        // Block signals to prevent lambdas from running during reset
                        
                        restart();
                        for (auto* input : playerInputs) input->blockSignals(false);
                    } else {
                        close();
                    }
                    return;
                }
            }
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
    if (!playerInputs.empty())
        playerInputs[0]->setFocus();
    infoLabel->clear();
    scoreLabel->setText("Score: 0");
}