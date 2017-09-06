import Repl from 'repl'
import EventEmitter from 'events'

import Web3 from 'web3'

import Web3InitScript from './ConsoleService/Web3InitScript'

class ConsoleStream extends EventEmitter {
  constructor (webView) {
    super()

    this.readable = true
    this.writeable = true

    this.webView = webView

    this.streamOpen = true

    this.pendingMessageBuffer = []
  }

  closeStream () {
    this.streamOpen = false
  }

  openStream () {
    this.streamOpen = true
  }

  write (data) {
    if (typeof data !== 'object') {
      data = {
        message: data,
        messageType: 'response'
      }
    }

    if (
      data.message.trim() === 'undefined' ||
      data.message.trim() === '' ||
      data.message.trim().match(/\.+/)
    ) {
      return
    }

    if (data.message.match(/.*Error:/)) {
      data.level = 'error'
    }

    data.time = new Date().toISOString()

    if (data.message !== '' && this.streamOpen) {
      this.pendingMessageBuffer = this.pendingMessageBuffer.concat(data)
    }
  }
  end () {}

  setEncoding (encoding) {}
  pause () {}
  resume () {}
  destroy () {
    this.webView = null
  }
  destroySoon () {}

  getPendingMessageBuffer () {
    const pendingMessages = this.pendingMessageBuffer
    this.pendingMessageBuffer = []
    return pendingMessages
  }
}

export default class ConsoleService {
  constructor (ipcMain, webView) {
    this.ipcMain = ipcMain
    this.webView = webView
    this.consoleStream = new ConsoleStream(webView)
    this.consoleStream.closeStream()

    this._console = Repl.start({
      prompt: '',
      input: this.consoleStream,
      output: this.consoleStream,
      ignoreUndefined: true
    })

    ipcMain.on('APP/SENDREPLCOMMAND', this.sendConsoleInput)
    ipcMain.on('APP/SENDREPLCOMMANDCOMPLETION', this._handleCommandCompletion)
  }

  log = message => {
    console.log(message)
    this.consoleStream.write({
      message,
      level: 'log'
    })
  }

  info = message => {
    console.info(message)
    this.consoleStream.write({
      message,
      level: 'info'
    })
  }

  warning = message => {
    console.warning(message)
    this.consoleStream.write({
      message,
      level: 'warning'
    })
  }

  error = message => {
    console.error(message)
    this.consoleStream.write({
      message,
      level: 'error'
    })
  }

  initializeWeb3Scripts = (host, port) => {
    this._console.context['Web3'] = Web3
    this.consoleStream.closeStream()
    new Web3InitScript(host, port).exportedScript().then(bootScript => {
      this.consoleStream.emit('data', bootScript)
      this.consoleStream.openStream()
    })
  }

  getPendingMessageBuffer = () => {
    return this.consoleStream.getPendingMessageBuffer()
  }

  _handleCommandCompletion = (e, cmd) => {
    this._console.complete(cmd, (err, completions) => {
      if (err) {
        console.log(err)
      }

      const payload = { completions: completions }
      this.webView.send('APP/REPLCOMMANDCOMPLETIONRESULT', payload)
    })
  }

  setConsoleContextItem = (key, value) => {
    console.log('Setting REPL context: ' + key + '=' + JSON.stringify(value))
    this._console.context[key] = value
  }

  sendConsoleInput = (e, input) => {
    if (!input.match(/^\..+/)) {
      this.consoleStream.emit('data', input + '\n')
    }
  }
}