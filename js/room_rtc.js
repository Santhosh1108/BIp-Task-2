const APP_ID = "YOUR_APP_ID"; // 🔴 PUT YOUR REAL APP ID HERE

let uid = sessionStorage.getItem("uid");
if (!uid) {
  uid = String(Math.floor(Math.random() * 10000));
  sessionStorage.setItem("uid", uid);
}

let token = null;
let client;

// RTM
let rtmClient;
let channel;

// URL params
const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
let roomId = urlParams.get("room");
let displayName = sessionStorage.getItem("display_name");

if (!roomId) roomId = "main";
if (!displayName) window.location = "lobby.html";

// RTC
let localTracks = [];
let remoteUsers = {};

let localScreenTracks;
let sharingScreen = false;

// =======================
// JOIN ROOM INIT
// =======================
let joinRoomInit = async () => {
  // RTM
  rtmClient = AgoraRTM.createInstance(APP_ID);
  await rtmClient.login({ uid, token });
  await rtmClient.addOrUpdateLocalUserAttributes({ name: displayName });

  channel = rtmClient.createChannel(roomId);
  await channel.join();

  channel.on("MemberJoined", handleMemberJoined);
  channel.on("MemberLeft", handleMemberLeft);
  channel.on("ChannelMessage", handleChannelMessage);

  getMembers();
  addBotMessageToDom(`Welcome to the room ${displayName} 👋`);

  // RTC
  client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
  await client.join(APP_ID, roomId, token, uid);

  client.on("user-published", handleUserPublished);
  client.on("user-left", handleUserLeft);
};

// =======================
// JOIN STREAM
// =======================
let joinStreams = async () => {
  document.getElementById("join-btn").style.display = "none";
  document.getElementsByClassName("stream__actions")[0].style.display = "flex";

  localTracks = await AgoraRTC.createMicrophoneAndCameraTracks(
    {},
    {
      encoderConfig: {
        width: { min: 640, ideal: 1280, max: 1920 },
        height: { min: 480, ideal: 720, max: 1080 },
      },
    }
  );

  let player = `
    <div class="video__container" id="user-container-${uid}">
      <div class="video-player" id="user-${uid}"></div>
    </div>
  `;

  document
    .getElementById("streams__container")
    .insertAdjacentHTML("beforeend", player);

  document
    .getElementById(`user-container-${uid}`)
    .addEventListener("click", expandVideoFrame);

  localTracks[1].play(`user-${uid}`);

  await client.publish(localTracks);
};

// =======================
// REMOTE USERS
// =======================
let handleUserPublished = async (user, mediaType) => {
  remoteUsers[user.uid] = user;
  await client.subscribe(user, mediaType);

  let player = document.getElementById(`user-container-${user.uid}`);
  if (!player) {
    player = `
      <div class="video__container" id="user-container-${user.uid}">
        <div class="video-player" id="user-${user.uid}"></div>
      </div>
    `;
    document
      .getElementById("streams__container")
      .insertAdjacentHTML("beforeend", player);

    document
      .getElementById(`user-container-${user.uid}`)
      .addEventListener("click", expandVideoFrame);
  }

  if (mediaType === "video") {
    user.videoTrack.play(`user-${user.uid}`);
  }

  if (mediaType === "audio") {
    user.audioTrack.play();
  }
};

let handleUserLeft = async (user) => {
  delete remoteUsers[user.uid];

  let item = document.getElementById(`user-container-${user.uid}`);
  if (item) item.remove();

  if (userIdInDisplayFrame === `user-container-${user.uid}`) {
    displayFrame.style.display = null;
  }
};

// =======================
// CONTROLS
// =======================
let toggleMic = async (e) => {
  let button = e.currentTarget;
  if (localTracks[0].muted) {
    await localTracks[0].setMuted(false);
    button.classList.add("active");
  } else {
    await localTracks[0].setMuted(true);
    button.classList.remove("active");
  }
};

let toggleCamera = async (e) => {
  let button = e.currentTarget;
  if (localTracks[1].muted) {
    await localTracks[1].setMuted(false);
    button.classList.add("active");
  } else {
    await localTracks[1].setMuted(true);
    button.classList.remove("active");
  }
};

// =======================
// SCREEN SHARE
// =======================
let toggleScreen = async (e) => {
  let screenButton = e.currentTarget;
  let cameraButton = document.getElementById("camera-btn");

  if (!sharingScreen) {
    sharingScreen = true;
    screenButton.classList.add("active");
    cameraButton.classList.remove("active");
    cameraButton.style.display = "none";

    localScreenTracks = await AgoraRTC.createScreenVideoTrack();
    await client.unpublish(localTracks[1]);
    await client.publish(localScreenTracks);

    localScreenTracks.play(`user-${uid}`);
  } else {
    sharingScreen = false;
    cameraButton.style.display = "block";
    screenButton.classList.remove("active");

    await client.unpublish(localScreenTracks);
    await client.publish(localTracks[1]);

    localTracks[1].play(`user-${uid}`);
  }
};

// =======================
// LEAVE STREAM
// =======================
let leaveStream = async (e) => {
  e.preventDefault();

  for (let track of localTracks) {
    track.stop();
    track.close();
  }

  if (localScreenTracks) {
    localScreenTracks.stop();
    localScreenTracks.close();
  }

  await client.leave();
  window.location = "lobby.html";
};

// =======================
// EVENT LISTENERS
// =======================
document.getElementById("mic-btn").addEventListener("click", toggleMic);
document.getElementById("camera-btn").addEventListener("click", toggleCamera);
document.getElementById("screen-btn").addEventListener("click", toggleScreen);
document.getElementById("join-btn").addEventListener("click", joinStreams);
document.getElementById("leave-btn").addEventListener("click", leaveStream);

// INIT
joinRoomInit();
