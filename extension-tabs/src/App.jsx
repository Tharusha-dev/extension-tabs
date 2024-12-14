import { useState } from "react";
import logo from "./logo.svg";
import "./App.css";
import { io } from "socket.io-client";
import { useEffect } from "react";


const serverUrl = "http://69.30.241.210:3020"

function App() {
  const [isConnected, setIsConnected] = useState(false);

  const [count, setCount] = useState(0);
  const [groups, setGroups] = useState([]);
  const [urls, setUrls] = useState([]);
  const [warningOpen, setWarningOpen] = useState(false)

  const [mode, setMode] = useState(0);

  const [autoModeGroupId, setAutoModeGroupId] = useState(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);


  function join() {
    chrome.runtime.sendMessage({ type: "connect-socket" });
  }



  useEffect(() => {
    // getRecentGroups();
    chrome.runtime.sendMessage({ type: "socket-status" }).then((result) => {
      setIsConnected(result);
    });
    chrome.storage.local.get("is-connected").then((result) => {
      setIsConnected(result["is-connected"]);
    });
    chrome.storage.local.get("url-store").then((result) => {
      console.log(result["url-store"]);

      if(result["url-store"]){
        setUrls(result["url-store"]);
      }
    });

    chrome.storage.local.get("groups").then((result) => {
      console.log(result["groups"]);
      if(result["groups"]){
        setGroups(result["groups"]);
      }
    });
  }, []);

  useEffect(() => {
    const messageListener = (message) => {
      switch (message.type) {
        case "socket-connected":
          setIsConnected(true);
          break;
        case "socket-disconnected":
          setIsConnected(false);
          break;
        case "url-added":
          console.log("url-added");
          const data = message.data;
          const cleanData = {
            groupId: data.groupId,
            url: data.url.replaceAll("`", ""),
            urlId: data.urlId,
          };

          // if(!groups.includes(cleanData.groupId)){

          //   if(mode == 1){
          //     console.log("Auto mode");
          //     createNewTabInWindow(cleanData.url, cleanData.urlId);
          //     setAutoModeGroupId(null);
          //     chrome.runtime.sendMessage({
          //       type: "delete-url",
          //       urlId: cleanData.urlId,
          //     });
          //     // setMode(0);
         
          //   }


          //   setGroups((previous) => [...previous, cleanData.groupId]);
          //  chrome.storage.local.get("groups").then((result) => {
          //   chrome.storage.local.set({ "groups": [...result.groups, cleanData.groupId] });
          //  });
           
          // }

          if (data.groupId == autoModeGroupId) {
            console.log("Auto mode");
            createNewTabInWindow(cleanData.url, cleanData.urlId);
            setAutoModeGroupId(null);
            chrome.runtime.sendMessage({
              type: "delete-url",
              urlId: cleanData.urlId,
            });

            // setMode(0);
            return;
          }

          setUrls((previous) => {
            const exists = previous.some(
              (item) =>
                item.groupId === cleanData.groupId && item.url === cleanData.url
            );
            return exists ? previous : [...previous, cleanData];
          });
          break;
        case "group-added":
          const group = message.group;
          if (mode == 1) {
            setAutoModeGroupId(group);
            console.log("Auto mode group id set to", group);
          }
          setGroups((previous) => {
            return previous.includes(group) ? previous : [...previous, group];
          });
          break;
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);

    return () => {
      chrome.runtime.onMessage.removeListener(messageListener);
    };
  }, [mode, autoModeGroupId]);

  function createNewTab(url, urlId) {
    chrome.runtime.sendMessage({ type: "create-new-tab", url: url });
    chrome.runtime.sendMessage({ type: "delete-url", urlId: urlId });
    // Remove URL from local state

    const newUrls = urls.filter((item) => item.urlId !== urlId);
    setUrls(newUrls);
    chrome.storage.local.set({ "url-store": newUrls });

  }

  function createNewTabInWindow(url, urlId) {
    chrome.runtime.sendMessage({ type: "create-new-tab-in-window", url: url });
    chrome.runtime.sendMessage({ type: "delete-url", urlId: urlId });
    // Remove URL from local state
    const newUrls = urls.filter((item) => item.urlId !== urlId);
    setUrls(newUrls);
    chrome.storage.local.set({ "url-store": newUrls });

  }

  return (
    <div className="App">
      {warningOpen && <div className="warning">
        Are You sure, this will delete all urls and groups from db
        <div>

        

        <button className="danger-button" onClick={()=> {chrome.runtime.sendMessage({ type: "clear-db" }); setWarningOpen(false)}}>Yes</button>
        <button className="join-button" onClick={()=> {setWarningOpen(false)}}>Cancel</button>
        </div>
  
        </div>}
      <div className="top">
        {isConnected ? (
          <span className="connected-status">
            
            <div className="circle"></div>
            Socket connected</span>
        ) : (
          <button className="join-button" onClick={join}>
            Join
          </button>
        )}
        
        <div className="settings-dropdown">
          <button 
            className="settings-button" 
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
          >
            Settings
          </button>
          
          {isSettingsOpen && (
            <div className="settings-content">
              <div className="settings-section">
                <h3>Mode</h3>
                <div className="modes-container">
                  <div className="option">
                    <input
                      type="checkbox"
                      id="manual-mode"
                      checked={mode === 0}
                      onChange={() => setMode(0)}
                    />
                    <label htmlFor="manual-mode">Manual</label>
                  </div>

                  <div className="option">
                    <input
                      type="checkbox"
                      id="auto-mode"
                      checked={mode === 1}
                      onChange={() => setMode(1)}
                    />
                    <label htmlFor="auto-mode">Auto</label>
                  </div>
                </div>
              </div>
              
              <div className="settings-section">
                <h3>Database</h3>
                <button 
                  className="danger-button"
                  onClick={() => {
                    
                    setWarningOpen(true)                    
                    setGroups([]);
                    setUrls([]);
                  }}
                >
                  Clear DB
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {groups.map((group) => (
        <div key={group} className="group-container">
          <h2 className="group-title">{group}</h2>
          <div className="urls-container">
            {urls
              .filter((url) => url.groupId == group)
              .map((url) => (
                <div key={url.url} className="url-row">
                  <span className="url-preview">{getUrlPreview(url.url)}</span>
                  <div className="url-actions">
                    <button
                      className="url-button"
                      onClick={() => {
                        createNewTab(url.url, url.urlId);
                        console.log(url);
                      }}
                    >
                      New Tab
                    </button>
                    <button
                      className="url-button"
                      onClick={() => createNewTabInWindow(url.url, url.urlId)}
                    >
                      New Window
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function getUrlPreview(url) {
  try {
    const urlObj = new URL(url);
    return `${urlObj.hostname}${urlObj.pathname.substring(0, 20)}${
      urlObj.pathname.length > 20 ? "..." : ""
    }`;
  } catch {
    return url.substring(0, 30) + (url.length > 30 ? "..." : "");
  }
}

export default App;
