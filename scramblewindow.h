#pragma once
#include <QWidget>
#include <QVBoxLayout>
#include <QLabel>
#include <QLineEdit>
#include "scramble.h"

class ScrambleWindow : public QWidget {
    Q_OBJECT
    Scramble scramble;
    QLabel* infoLabel;
    QLabel* scoreLabel;
    QVBoxLayout *layout;
    std::vector<QLineEdit*> playerInputs;
    std::vector<QLabel*> yardLabels;
public:
    ScrambleWindow(QWidget *parent = nullptr);
    void restart();
};