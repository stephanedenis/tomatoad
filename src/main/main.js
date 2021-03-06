const { app, BrowserWindow, Tray, Menu, ipcMain, shell } = require('electron')

var Positioner = require('electron-positioner')

const path = require('path')
const url = require('url')

const countdown = require('./countdown')
const slack = require('./slack/slack.main')
const db = require('./database/database')
const appSettings = require('./settings.json')

let pomodoroLengthSeconds = 1500 // 25 minutes
let breakLengthSeconds = 300 // 5 minutes

let settings = {
    autoStartBreak: true,
    autoStartNextPomodoro: true,
    askForNotes: true,
    slackTeams: [],
};

let currentPomodoro = null

db.loadSettings(x => {
    Object.assign(settings, x);

    slack.loadAuthTokens(function() {
        settings.slackTeams = slack.getTeams()
   })
})

const isDevelopment = process.env.NODE_ENV !== 'production'

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let trayIcon
let overlayWindow
let aboutWindow
let settingsWindow
let notesBeforeWindow
let notesAfterWindow

function createSystemTrayIcon() {
    trayIcon = new Tray(path.join(__static, 'tomato.ico'))

    const trayMenuTemplate = [
        {
            label: 'Tomatoad',
            enabled: false
        }, {
            label: 'Settings',
            click: function () {
                createSettingsWindow()
            }
        }, {
            label: '&About',
            click: function () {
                createAboutWindow()
            }
        }, {
            label: 'What\'s New?',
            click: function () {
                shell.openExternal(`https://github.com/dracan/tomatoad/releases/tag/${appSettings.version}`)
            }
        }, {
            label: 'Report bug or suggest a feature',
            click: function () {
                shell.openExternal('https://github.com/dracan/tomatoad/issues')
            }
        }, {
            label: '&Exit',
            click: function () {
                app.exit();
            }
        }
    ]

    trayIcon.on('click', () => {
        overlayWindow.isVisible() ? overlayWindow.hide() : overlayWindow.show()
    })

    let trayMenu = Menu.buildFromTemplate(trayMenuTemplate)
    trayIcon.setContextMenu(trayMenu)
}

function createOverlayWindow() {
    overlayWindow = new BrowserWindow({ width: 125, height: 45, frame: false, webPreferences: { webSecurity: false }, show: false })

    var positioner = new Positioner(overlayWindow)
    positioner.move('bottomRight')

    overlayWindow.setMenu(null)
    overlayWindow.setIcon(path.join(__static, 'tomato.ico'))
    overlayWindow.setAlwaysOnTop(true, "floating")
    overlayWindow.setResizable(false)
    overlayWindow.setSkipTaskbar(true);

    overlayWindow.once('ready-to-show', () => {
        overlayWindow.show()
    })

    if(isDevelopment) {
        overlayWindow.loadURL(`http://localhost:${process.env.ELECTRON_WEBPACK_WDS_PORT}#overlay`);
    } else {
        overlayWindow.loadURL(`file:///${__dirname}/index.html#overlay`)
    }

    // For dev
    // overlayWindow.maximize()
    // overlayWindow.webContents.openDevTools()

    overlayWindow.on('closed', function () {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        overlayWindow = null
    })
}

function createAboutWindow() {
    aboutWindow = new BrowserWindow({ width: 470, height: 280, webPreferences: { webSecurity: false }, show: false })

    aboutWindow.setMenu(null)
    aboutWindow.setIcon(path.join(__static, 'tomato.ico'))

    aboutWindow.once('ready-to-show', () => {
        aboutWindow.show()
    })

    if(isDevelopment) {
        aboutWindow.loadURL(`http://localhost:${process.env.ELECTRON_WEBPACK_WDS_PORT}#about`);
    } else {
        aboutWindow.loadURL(`file:///${__dirname}/index.html#about`)
    }

    // Force hyperlinks to open in external browser
    // (https://stackoverflow.com/questions/32402327/how-can-i-force-external-links-from-browser-window-to-open-in-a-default-browser)
    aboutWindow.webContents.on('new-window', function(e, url) {
        e.preventDefault();
        require('electron').shell.openExternal(url);
    });

    // For dev
    // aboutWindow.maximize()
    // aboutWindow.webContents.openDevTools()

    aboutWindow.on('closed', function () {
        aboutWindow = null
    })
}

function createSettingsWindow() {
    settingsWindow = new BrowserWindow({ width: 500, height: 400, webPreferences: { webSecurity: false }, show: false })

    settingsWindow.setMenu(null)
    settingsWindow.setIcon(path.join(__static, 'tomato.ico'))

    settingsWindow.once('ready-to-show', () => {
        settingsWindow.show()
    })

    const loadUrlFunction = function() {
        if(isDevelopment) {
            settingsWindow.loadURL(`http://localhost:${process.env.ELECTRON_WEBPACK_WDS_PORT}#settings`)
        } else {
            settingsWindow.loadURL(`file:///${__dirname}/index.html#settings`)
        }

        settingsWindow.setTitle("Settings")
    }

    loadUrlFunction()

    // Handle Slack auth
    settingsWindow.webContents.on('did-get-response-details', function (event, status, newURL, originalURL, httpResponseCode, requestMethod, referrer, headers, resourceType) {
        if(newURL.indexOf("https://tomatoadauth.azurewebsites.net/api/slackauth") !== -1) {
            if(headers['x-team-name'] && headers['x-team-name'][0] && headers['x-auth-code'] && headers['x-auth-code'][0]) {
                slack.setAuthCode(headers['x-team-name'][0], headers['x-auth-code'][0]);
                settings.slackTeams.push(headers['x-team-name'][0])
                loadUrlFunction()
            }
        }
    });

    // For dev
    // settingsWindow.maximize()
    // settingsWindow.webContents.openDevTools()

    settingsWindow.on('closed', function () {
        settingsWindow = null
    })
}

function createNotesBeforeWindow() {
    notesBeforeWindow = new BrowserWindow({ width: 500, height: 200, webPreferences: { webSecurity: false }, show: false })

    notesBeforeWindow.setMenu(null)
    notesBeforeWindow.setIcon(path.join(__static, 'tomato.ico'))
    notesBeforeWindow.setAlwaysOnTop(true, "floating")
    notesBeforeWindow.setTitle("Pomodoro Goals")

    notesBeforeWindow.once('ready-to-show', () => {
        notesBeforeWindow.show()
    })

    if(isDevelopment) {
        notesBeforeWindow.loadURL(`http://localhost:${process.env.ELECTRON_WEBPACK_WDS_PORT}#notes-before`)
    } else {
        notesBeforeWindow.loadURL(`file:///${__dirname}/index.html#notes-before`)
    }

    // For dev
    // notesBeforeWindow.maximize()
    // notesBeforeWindow.webContents.openDevTools()

    notesBeforeWindow.on('closed', function () {
        notesBeforeWindow = null
    })
}

function createNotesAfterWindow() {
    notesAfterWindow = new BrowserWindow({ width: 600, height: 350, webPreferences: { webSecurity: false }, show: false })

    notesAfterWindow.setMenu(null)
    notesAfterWindow.setIcon(path.join(__static, 'tomato.ico'))
    notesAfterWindow.setAlwaysOnTop(true, "floating")
    notesAfterWindow.setTitle("Pomodoro Completed")

    notesAfterWindow.once('ready-to-show', () => {
        notesAfterWindow.show()
        notesAfterWindow.webContents.send('init-data', currentPomodoro)
    })

    if(isDevelopment) {
        notesAfterWindow.loadURL(`http://localhost:${process.env.ELECTRON_WEBPACK_WDS_PORT}#notes-after`)
    } else {
        notesAfterWindow.loadURL(`file:///${__dirname}/index.html#notes-after`)
    }

    // For dev
    // notesAfterWindow.maximize()
    // notesAfterWindow.webContents.openDevTools()

    notesAfterWindow.on('closed', function () {
        notesAfterWindow = null
    })
}

app.on('ready', function() {
    createSystemTrayIcon();
    createOverlayWindow();
})

broadcastEvent = function(eventName, arg) {
    overlayWindow && overlayWindow.webContents.send(eventName, arg)
}

ipcMain.on('pomodoro-start', (evt, force, textBefore) => {
    if(notesBeforeWindow) {
        notesBeforeWindow.close()
    }

    if(settings.askForNotes && !force) {
        createNotesBeforeWindow()
    } else {
        onPomodoroStart(textBefore)
    }
})

function onPomodoroStart(textBefore) {
    countdown.init(pomodoroLengthSeconds, count => {
        broadcastEvent("countdown", count)
    }, () => {
        createNotesAfterWindow()

        broadcastEvent('pomodoro-complete')
        slack.setStatus("", "")
        slack.setDoNotDisturb(0)

        if(settings.autoStartBreak) {
            setTimeout(_ => {
                ipcMain.emit('break-start')
            }, 1000);
        }
    });

    broadcastEvent('pomodoro-start')

    currentPomodoro = {
        completed: false,
        textBefore: textBefore,
    }

    db.savePomodoro(currentPomodoro)

    slack.setStatus("25 minutes", ":tomato:")
    slack.setDoNotDisturb(25)
}

ipcMain.on('break-start', (evt) => {
    countdown.init(breakLengthSeconds, count => {
        broadcastEvent("countdown", count)
    }, () => {
        broadcastEvent('break-complete')

        if(settings.autoStartNextPomodoro) {
            setTimeout(_ => {
                ipcMain.emit('pomodoro-start')
            }, 1000);
        }
    });

    broadcastEvent('break-start')
})

ipcMain.on('save-completed-pomodoro', (evt, data) => {
    Object.assign(currentPomodoro, data);
    db.savePomodoro(currentPomodoro)
})

ipcMain.on('pomodoro-stop', (evt) => {
    countdown.stop()
    slack.setStatus("", "")
    slack.setDoNotDisturb(0)
})

ipcMain.on('break-stop', (evt) => {
    countdown.stop()
})

ipcMain.on('close-notes-after', (evt) => {
    if(notesAfterWindow) {
        notesAfterWindow.close()
    }
})

ipcMain.on('get-settings', (evt) => {
    settingsWindow && settingsWindow.webContents.send('got-settings', settings)
})

ipcMain.on('save-settings', (evt, s) => {
    Object.assign(settings, s);
    db.saveSettings(settings)
})

ipcMain.on('revoke-slack-team', (evt, teamName) => {
    let index = settings.slackTeams.indexOf(teamName)
    if(index > -1) {
        settings.slackTeams.splice(index, 1)
    }

    slack.revokeTeam(teamName)
})
