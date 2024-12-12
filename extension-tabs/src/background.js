console.log("background.js");



async function getUrls(){
    const resUrls = await fetch(`http://69.30.241.210:3020/urls`);
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
    const resGroups = await fetch(`http://69.30.241.210:3020/groups`);
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

async function deleteUrl(urlId){
    const res = await fetch(`http://69.30.241.210:3020/delete-url`, {
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
    const res = await fetch(`http://69.30.241.210:3020/clear-db`, {
        headers: {
            'Content-Type': 'application/json'
        },
        method: "DELETE"
    });
}

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    console.log(request);
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
