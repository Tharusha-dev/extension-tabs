import { useState } from "react";
import logo from "./logo.svg";
import "./App.css";
import { io } from "socket.io-client";
import { useEffect } from "react";

function App() {
  const [socket, setSocket] = useState(null);

  // const socket = io("http://localhost:3020", {
  //   query: {
  //     type: "extension-request"
  //   }
  // });

  const [count, setCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);

  const [groups, setGroups] = useState([]);
  const [urls, setUrls] = useState([]);

  const [mode, setMode] = useState(0);

  const [autoModeGroupId, setAutoModeGroupId] = useState(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // async function getinitialData(){
  //   const resGroups = await fetch("http://localhost:3000/groups");
  //   const dataGroups = await resGroups.json();
  //   setGroups(dataGroups);

  // }

  function join() {
    setSocket(
      io("http://69.30.241.210:3020", {
        query: {
          type: "extension-request",
        },
      })
    );
  }

  async function getRecentGroups() {
    chrome.runtime.sendMessage(
      { type: "get-recent-groups" },
      function (response) {
        setGroups(response);
      }
    );
  }

  useEffect(() => {
    getRecentGroups();
  }, []);

  useEffect(() => {
    function onConnect() {
      setIsConnected(true);
    }

    function onDisconnect() {
      setIsConnected(false);
    }

    async function addUrl(data) {
      console.log(data);

      const cleanData = {
        groupId: data.groupId,
        url: data.url.replaceAll("`", ""),
        urlId: data.urlId,
      };

      if (data.groupId == autoModeGroupId) {
        console.log("URL is in auto group ", autoModeGroupId, data.groupId);
        createNewTabInWindow(cleanData.url, cleanData.urlId);
        setAutoModeGroupId(null);
        chrome.runtime.sendMessage({
          type: "delete-url",
          urlId: cleanData.urlId,
        });
        return;
      } else {
        console.log("URL is not in auto group ", autoModeGroupId, data.groupId);
      }
      // Clean up the URL by removing backticks and decoding

      console.log(cleanData);
      setUrls((previous) => {
        // Check if URL already exists for this group
        const exists = previous.some(
          (item) =>
            item.groupId === cleanData.groupId && item.url === cleanData.url
        );
        // Only add if it doesn't exist
        return exists ? previous : [...previous, cleanData];
      });
    }

    function addGroup(group) {
      if (mode == 1) {
        console.log("Adding group to auto mode ", group);
        setAutoModeGroupId(group);
      }

      setGroups((previous) => {
        // Check if group already exists
        return previous.includes(group) ? previous : [...previous, group];
      });
    }

    if (socket) {
      socket.on("connect", onConnect);
      socket.on("disconnect", onDisconnect);

      socket.on("url-added", addUrl);
      socket.on("group-added", addGroup);
    }
    // return () => {
    //   socket.off('connect', onConnect);
    //   socket.off('disconnect', onDisconnect);

    // };
  }, [socket, autoModeGroupId]);

  function createNewTab(url, urlId) {
    chrome.runtime.sendMessage({ type: "create-new-tab", url: url });
    chrome.runtime.sendMessage({ type: "delete-url", urlId: urlId });
    // Remove URL from local state
    setUrls((previous) => previous.filter((item) => item.urlId !== urlId));
  }

  function createNewTabInWindow(url, urlId) {
    chrome.runtime.sendMessage({ type: "create-new-tab-in-window", url: url });
    chrome.runtime.sendMessage({ type: "delete-url", urlId: urlId });
    // Remove URL from local state
    setUrls((previous) => previous.filter((item) => item.urlId !== urlId));
  }

  return (
    <div className="App">
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
                    if (window.confirm('Are you sure you want to clear the database? This will remove all urls and groups.')) {
                      chrome.runtime.sendMessage({ type: "clear-db" });
                    }
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
