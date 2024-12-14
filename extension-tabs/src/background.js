import { io } from "socket.io-client";

let socket = null;
const serverUrl = "http://69.30.241.210:3020"
// const serverUrl = "http://localhost:3020"

// Initialize socket connection
function initializeSocket() {
    if (!socket) {
        
        console.log("initializeSocket");
        socket = io(serverUrl, {
            transports: ['websocket'],
            query: {
                type: "extension-request",
            },
        });
        console.log(socket);
        socket.on("connect", () => {
            chrome.runtime.sendMessage({ type: "socket-connected" }).catch(() => {
                console.debug('Popup is closed, could not send socket-connected message');
            });
            chrome.storage.local.set({"is-connected": true});
        });

        socket.on("disconnect", () => {
            chrome.runtime.sendMessage({ type: "socket-disconnected" }).catch(() => {
                console.debug('Popup is closed, could not send socket-disconnected message');
            });
            chrome.storage.local.set({"is-connected": false});
        });

        socket.on("url-added", (data) => {
            console.log("url-added");
            console.log(data);
            chrome.runtime.sendMessage({ type: "url-added", data }).catch(() => {
                console.debug('Popup is closed, could not send url-added message');
            });
            
            // Update storage with new URL
            chrome.storage.local.get("url-store", (result) => {
                const urls = result["url-store"] || [];
                // Check if URL with same ID already exists
                const urlExists = urls.some(url => url.urlId === data.urlId);
            console.log(urlExists);

                if (!urlExists) {
                    urls.push(data);
                    console.log(urls);
                    chrome.storage.local.set({ "url-store": urls });
                }
            });
            console.log("url-added 2 to store");
        });
        
        socket.on("group-added", (group) => {
            chrome.runtime.sendMessage({ type: "group-added", group }).catch(() => {
                console.debug('Popup is closed, could not send group-added message');
            });
            // Update storage with new group
            chrome.storage.local.get(["groups", "recent-groups"], (result) => {
                const groups = result.groups || [];
                const recentGroups = result["recent-groups"] || [];
                
                // Check if group already exists in groups array
                const groupExists = groups.includes(group);
                const recentGroupExists = recentGroups.includes(group);
        
                let updatedGroups = groups;
                let updatedRecentGroups = recentGroups;
        
                if (!groupExists) {
                    updatedGroups = [...groups, group];
                }
                if (!recentGroupExists) {
                    updatedRecentGroups = [...recentGroups, group];
                }
        
                // Only update storage if there are changes
                if (!groupExists || !recentGroupExists) {
                    console.log(updatedGroups);
                    console.log(updatedRecentGroups);
                    chrome.storage.local.set({ 
                        "groups": updatedGroups,
                        "recent-groups": updatedRecentGroups
                    });
                }
            });
        });
    }
}

console.log("background.js");

async function getUrls(){
    const resUrls = await fetch(`${serverUrl}/urls`);
    const dataUrls = await resUrls.json();
    console.log(dataUrls);

    const groups = Object.keys(dataUrls);
    console.log(groups);

    // setGroups(groups);

    // Flatten the grouped URLs into a single array
    const flattenedUrls = Object.values(dataUrls).flat();

    return {groups, urls: flattenedUrls}



}

async function getRecentGroups(){
    const resGroups = await fetch(`${serverUrl}/groups`);
    const dataGroups = await resGroups.json();
    console.log(dataGroups);
    return dataGroups;
}


function createNewTabInBackground(url){
    chrome.tabs.create({url: url, active: false});
}

function createNewTabInWindow(url) {
    chrome.windows.create({
        url: url,
        focused: false  // Set to true if you want the new window to be focused
    });
}

async function getGroupById(groupId){
    const res = await fetch(`${serverUrl}/group/${groupId}`);
    const data = await res.json();
    return data;
}

async function deleteUrl(urlId){
    const res = await fetch(`${serverUrl}/delete-url`, {
        headers: {
            'Content-Type': 'application/json'
        },
        method: "POST",
        body: JSON.stringify({urlId: urlId})
    });
    const data = await res.json();
    console.log(data);
}

async function clearDb(){
    const res = await fetch(`${serverUrl}/clear-db`, {
        headers: {
            'Content-Type': 'application/json'
        },
        method: "DELETE"
    });
    const data = await res.json();
    console.log(data);
    chrome.storage.local.set({
        "url-store": [],
        "groups": [],
        "recent-groups": []
    });
}

// Add this function to initialize storage
async function initializeStorage() {
    const { urls, groups } = await getUrls();
    const recentGroups = await getRecentGroups();
    chrome.storage.local.set({
        "url-store": urls,
        "groups": groups,
        "recent-groups": recentGroups
    });
}

// Add initialization when the background script starts
// initializeStorage();

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    console.log(request);

    if (request.type === "connect-socket") {
        initializeSocket();
    }

    if (request.type === "socket-status") {
        // initializeSocket();
        console.log("socket-status");
        console.log(socket);

        if(socket){
            sendResponse(true);
        }else{
            sendResponse(false);
            chrome.storage.local.set({"is-connected": false});
        }
    }


    if (request.type === "get-urls") {
        getUrls().then(data => sendResponse(data));
    }
    if (request.type === "get-recent-groups") {
        getRecentGroups().then(data => sendResponse(data));
    }
    if (request.type === "create-new-tab") {
        createNewTabInBackground(request.url);
    }
    if (request.type === "create-new-tab-in-window") {
        createNewTabInWindow(request.url);
    }

    if(request.type === "delete-url"){
        deleteUrl(request.urlId);
    }
    if(request.type === "clear-db"){
        clearDb();
    }
    return true;
});
