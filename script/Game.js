/**
 * The game
 * @constructor
 * @param {HTMLCanvasElement} canvas  - Canvas for displaying the game
 */
function Game(canvas, messageLogElement, replyButtonElement, pauseButtonElement)
{
  // Properties: Canvas
  this.canvas = canvas;
  this.context = canvas.getContext("2d");

  this.canvasWidth = canvas.width;

  this.canvasHeight = canvas.height;
  this.halfCanvasHeight = (canvas.height/2);

  // Properties: DOM Elements
  this.messageLogElement = messageLogElement;
  this.replyButtonElement = replyButtonElement;
  this.pauseButtonElement = pauseButtonElement;

  // Properties: User Events
  this.isMouseClicked = false;
  this.isMouseDown = false;
  this.mouseMovements = [];
  this.isPauseButtonClicked = false;
  this.isReplyButtonPressed = false;

  // Properties: Game
  this.currentState = GameState.Starting;

  // Properties: Line
  this.linePoints = [];

  // Properties: Nodes
  this.nodes = [];
  this.activeNodes = [];
  this.startNode = null;
  this.endNode = null;
  this.nodeRadius = this.canvasWidth * GameSettings.NodeRadiusPercentage;

  // Properties: Blocks
  this.blocks = [];

  // Properties: Stages
  this.currentStage = 0;
  this.loadStage(this.currentStage);
  this.stageIntroTimer = 0;

  // Properties: Messages
  this.nextDisplayMessage = null;
  this.currentMessageIndex = 0;
  this.messageTimer = 0;

  // Properties: Message Replies
  this.replyTimerMax = GameSettings.ReplyTimerMax;
  this.replyTimer = 0;
  this.replyCount = 0;
  this.hasReplied = false;

  // Properties: Score
  this.currentScore = 0;
  this.totalScore = 0;
}

/**
 * Resets the game to a state before a stage begins
 */
Game.prototype.resetStage = function()
{
  // Reset lines
  this.resetLine();

  // Reset nodes
  this.nodes = [];
  this.activeNodes = [];
  this.startNode = null;
  this.endNode = null;

  // Reset blocks
  this.blocks = [];

  // Reset messages
  this.currentMessageIndex = 0;
  this.messageTimer = 0;
  this.replyTimer = 0;
  this.hasReplied = false;

  // Reset score
  this.currentScore = GameSettings.StageScoreStart;
}

/**
 * Resets a line to a state before it was drawn
 */
Game.prototype.resetLine = function()
{
  this.linePoints = [];
  this.activeNodes = [];
}

/**
 * Advances the user to the next stage
 */
Game.prototype.advanceStage = function()
{
  this.totalScore += this.currentScore;

  this.resetStage();

  this.currentStage++;
  this.loadStage(this.currentStage);

  this.currentState = GameState.StartingStage;
  this.stageIntroTimer = GameSettings.StageIntroTimerMax;
}

/**
 * Loads the stage corresponding to the specified index
 * @param {integer} index  - Index of the stage to load
 */
Game.prototype.loadStage = function(index)
{
  function calcRelativeValue(percentage, context) {
    return (parseInt(percentage, 10)/100) * context;
  }

  var self = this;
  var stageData = stages[index];
  var stageElements = stageData.split(';');

  stageElements.forEach(function(elem, i) {

    var elemData = elem.split(/[,\(\)]/);

    var key = elemData[0];
    var x = calcRelativeValue(elemData[1], self.canvasWidth);
    var y = calcRelativeValue(elemData[2], self.canvasHeight);

    switch(key)
    {
      // Start Node
      case 'S':
        self.startNode = new Node(NodeType.Start, x, y, self.nodeRadius);
        self.nodes.push(self.startNode);
        break;

      // End Node
      case 'E':
        self.endNode = new Node(NodeType.End, x, y, self.nodeRadius);
        self.nodes.push(self.endNode);
        break;

      // Connecting Node
      case 'C':
        self.nodes.push(new Node(NodeType.Connect, x, y, self.nodeRadius));
        break;

      // Block
      case 'B':
        var width = calcRelativeValue(elemData[3], self.canvasWidth);
        var height = calcRelativeValue(elemData[4], self.canvasHeight);

        self.blocks.push(new Block(x, y, width, height));
        break;
    }

  });
}

/**
 * Updates the game's state
 */
Game.prototype.update = function()
{
  // STATE: Stage interstitial
  if(this.currentState === GameState.StartingStage)
  {
    if(this.stageIntroTimer <= 0)
    {
      this.currentState = GameState.Playing;
      return;
    }

    this.stageIntroTimer--;
    return;
  }

  // STATE: Paused
  if(this.currentState != GameState.Playing)
  {
    return;
  }

  // Update score
  this.currentScore--;

  this.updateMessages();

}

/**
 * Updates the state of messages within the game
 */
Game.prototype.updateMessages = function()
{
  // Respond to user events
  this.handleMouseClick();
  this.handleMouseUp();
  this.handleMouseMove();
  this.handlePauseButtonClick();

  if(!this.isReplyOptionActive)
  {
    this.replyTimer = 0;
  }

  // Display chat messages
  var levelMessages = messages[this.currentStage];

  if(!levelMessages)
  {
    return;
  }

  if(this.currentMessageIndex >= levelMessages.length)
  {
    // All of the messages for this stage have been displayed
    return;
  }

  var currMessage = levelMessages[this.currentMessageIndex];

  // CHECK: Current message display condition
  if(currMessage.condition && !currMessage.condition(game))
  {
    // Condition to display message hasn't been met, skip the message
    this.currentMessageIndex++;
    return;
  }

  // CHECK: Previous message reply
  var prevMessage = levelMessages[this.currentMessageIndex - 1];

  if(prevMessage && prevMessage.awaitReply && !this.hasReplied)
  {
    if(this.isReplyOptionActive)
    {
      this.replyTimer++;
    }

    if(this.replyTimer > this.replyTimerMax)
    {
      this.replyCount++;
      this.hasReplied = true;
    }
  }

  if(!currMessage.delay || this.messageTimer >= currMessage.delay)
  {
    // Prepare the message for display
    this.nextDisplayMessage = currMessage.content;
    this.messageTimer = 0;
    this.currentMessageIndex++;
    this.hasReplied = false;
    return;
  }

  this.messageTimer++;
}

/**
 * Checks if the user has clicked their mouse and updates game's state
 * if applicable
 */
Game.prototype.handleMouseClick = function()
{
  if(!this.isMouseClicked)
  {
    return;
  }

  this.isMouseClicked = false;

  if(game.currentState === GameState.Starting)
  {
    this.stageIntroTimer = GameSettings.StageIntroTimerMax;
    game.currentState = GameState.StartingStage;
    return;
  }

  if(game.currentState === GameState.Paused)
  {
    game.currentState = GameState.Playing;
    return;
  }
}

/**
 * Checks if the user has unpressed their mouse button and updates game's state
 * if applicable
 */
Game.prototype.handleMouseUp = function()
{
  if(this.isMouseDown)
  {
    return;
  }

  game.resetLine();
}

/**
 * Checks if the user has clicked the pause button and updates the game's state
 * if applicable
 */
Game.prototype.handlePauseButtonClick = function()
{
  if(!this.isPauseButtonClicked)
  {
    return;
  }

  this.isPauseButtonClicked = false;

  if(game.currentState === GameState.Paused)
  {
    game.currentState = GameState.Playing;
  }
  else
  {
    game.currentState = GameState.Paused;
  }
}

/**
 * Checks if the user has moved their mouse and updates the game's state
 * if applicable
 */
Game.prototype.handleMouseMove = function()
{
  if(!game.isMouseDown)
  {
    this.mouseMovements = [];
    return;
  }

  this.mouseMovements.forEach(function(movement, i) {
    handleExtendLine(movement.x, movement.y);
  });
}

/**
 * Handles the extension of the user's line, triggering appropriate actions
 * based on where the line has moved
 * @param {integer} x       - X-coordinate of where to extend the line
 * @param {integer} y       - Y-cooridnate of where to extend the line
 */
Game.prototype.handleExtendLine = function(x, y) {

  var self = this;

  var reflectX = self.canvasWidth - x;
  var reflectY = self.canvasHeight - y;

  // Detect if user has moved outside the drawing bounds
  if(y > (self.canvasHeight/2))
  {
    self.resetLine();
  }

  if(self.isMouseDown)
  {
    // Detect if user has touched any blocks
    self.blocks.forEach(function(block, i) {

      if(block.contains(x, y) || block.contains(reflectX, reflectY)) {
        self.resetLine();
      }

    });

    // Activate all nodes that the user is touching
    self.nodes.forEach(function(node, i) {

      if(self.activeNodes[i]) {
        return;
      }

      if(self.contains(x, y) || node.contains(reflectX, reflectY)) {
        self.activeNodes[i] = true;
      }

    });

    // Draw the line
    var hasLineStarted = self.linePoints.length > 0;
    if(hasLineStarted || self.activeNodes[0])
    {
      self.linePoints.push({ x: x, y: y });
    }

    // Get a count of active nodes
    var activeNodesCount = 0;
    self.activeNodes.forEach(function(node, i) {
      activeNodesCount++;
    });

    if(self.activeNodes[1])
    {
      if(activeNodesCount === self.nodes.length)
      {
        self.advanceStage();
      }
      else
      {
        self.resetLine();
      }
    }
  }

}

/**
 * Draws the game
 */
Game.prototype.draw = function()
{
  var self = this;
  var context = this.context;

  // Clear the canvas
  context.clearRect(0, 0, this.canvasWidth, this.canvasHeight);

  // STATE: Start Screen
  if(this.currentState === GameState.Starting)
  {
    this.drawTitleScreen('GAME TITLE');
    return;
  }

  // STATE: Pause Screen
  if(this.currentState === GameState.Paused)
  {
    this.drawTitleScreen('PAUSED');
    return;
  }

  // STATE: Level Interstitial
  if(this.currentState === GameState.StartingStage)
  {
    this.drawTitleScreen('STARTING A LEVEL');
    return;
  }

  // Draw field
  context.fillStyle = GameSettings.DrawFieldBackgroundFillStyle;
  context.fillRect(0, 0, this.canvasWidth, this.halfCanvasHeight);

  // Reflect field
  context.fillStyle = GameSettings.ReflectFieldBackgroundFillStyle;
  context.fillRect(0, this.halfCanvasHeight, this.canvasWidth, this.halfCanvasHeight);

  // Score
  context.fillStyle = GameSettings.DrawFieldTextFillStyle;
  context.fillText("TOTAL SCORE: " + this.totalScore, 10, 20);
  context.fillText("STAGE SCORE: " + this.currentScore, 10, 40);

  // Messages
  if(this.nextDisplayMessage)
  {
    this.drawMessage(this.nextDisplayMessage);
    this.nextDisplayMessage = null;
  }

  // Nodes
  this.nodes.forEach(function(node, i) {
    node.draw(context);
  });

  // Blocks
  this.blocks.forEach(function(block, i) {
    block.draw(context);
  });

  // Draw the user's line
  this.drawUserLine(false);

  // Draw the reverse of the user's line
  this.drawUserLine(true);
}

/**
 * Draws a message to the screen
 * @param {string} text  - Message to display onscreen
 */
Game.prototype.drawMessage = function(message)
{
  this.messageLogElement.innerHTML += message;
}

/**
 * Clears all of the messages onscreen
 */
Game.prototype.clearDrawnMessages = function()
{
  this.messageLogElement.innerHTML = '';
}

/**
 * Draws a screen with just a message
 * @param {string} text  - Text to display onscreen
 */
Game.prototype.drawTitleScreen = function(text)
{
  var context = this.context;

  context.fillStyle = GameSettings.BackgroundFillStyle;
  context.fillRect(0, 0, this.canvasWidth, this.canvasHeight);

  context.fillStyle = GameSettings.TextFillStyle;
  context.fillText(text, 100, 100);
}

/**
 * Draws a user's line to screen
 * @param {boolean} isReflected  -  Whether or not the line is being drawn on
 *                                  the reflected field
 */
Game.prototype.drawUserLine = function(isReflected)
{
  var context = this.context;

  context.strokeStyle = GameSettings.UserLineFillStyle;
  context.beginPath();
  context.lineWidth = GameSettings.UserLineWidth;

  this.linePoints.forEach(function(point, i) {

    var x = point.x;
    var y = point.y;

    if(isReflected)
    {
      x = self.canvasWidth - point.x;
      y = self.canvasHeight - point.y;
    }

    if(i === 0)
    {
      context.moveTo(x, y);
    }
    else
    {
      context.lineTo(x, y);
    }

  });

  context.lineJoin = 'round';
  context.stroke();
}

/**
 * Starts the game
 */
Game.prototype.start = function()
{
  var self = this;

  self.canvas.addEventListener('mousedown', function() { self.isMouseDown = true; }, false);
  self.canvas.addEventListener('mouseup', function() { self.isMouseDown = false; }, false);
  self.canvas.addEventListener('mousemove', function(mouseEvent) { self.mouseMovements.push({ x: mouseEvent.clientX, y: mouseEvent.clientY }); }, false);
  self.canvas.addEventListener('click', function() { self.isMouseClicked = true; }, false);

  self.replyButtonElement.addEventListener('mousedown', function() { self.isReplyButtonPressed = true; }, false);
  self.replyButtonElement.addEventListener('mouseup', function() { self.isReplyButtonPressed = false; }, false);

  self.pauseButtonElement.addEventListener('click', function(mouseEvent) { self.isPauseButtonClicked = true; }, false);

  function loop()
  {
    self.update();
    self.draw();
  }

  self.loadStage(0);

  window.setInterval(loop, 50);
  loop();
}