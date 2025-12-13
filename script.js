        document.addEventListener('DOMContentLoaded', () => {
            // --- SPLASH SCREEN LOGIC ---
            const splashScreen = document.getElementById('splash-screen');
            const appWrapper = document.getElementById('app-wrapper');
            
            const showApp = () => {
                splashScreen.classList.add('splash-fade-out');
                setTimeout(() => {
                    splashScreen.style.display = 'none';
                    appWrapper.classList.remove('hidden');
                }, 500); 
            };

            setTimeout(() => {
                showApp();
            }, 2500);


            // --- APP LOGIC ---
            let currentChatData = null;
            let receiverName = '';

            const fileInput = document.getElementById('fileInput');
            const chatContent = document.getElementById('chatContent');
            const chatContainer = document.getElementById('chatContainer');
            const exportBtn = document.getElementById('exportBtn');
            const fileNameDisplay = document.getElementById('fileName');

            fileInput.addEventListener('change', handleFileUpload);
            exportBtn.addEventListener('click', exportToPDF);

            async function handleFileUpload(event) {
                const file = event.target.files[0];
                if (!file) return;

                fileNameDisplay.textContent = file.name;
                chatContent.innerHTML = '<div class="loading">Loading chat...</div>';

                try {
                    const text = await readFileAsUTF8(file);
                    const data = parseWhatsAppChat(text);

                    if (data.messages.length === 0) {
                        chatContent.innerHTML = '<div class="empty-state"><h2>No Messages Found</h2><p>Please check the file format</p></div>';
                        return;
                    }

                    currentChatData = data;
                    receiverName = data.receiverName; 
                    renderChat(data);
                    exportBtn.style.display = 'flex';

                    setTimeout(() => {
                        chatContainer.scrollTop = chatContainer.scrollHeight;
                    }, 100);
                } catch (error) {
                    console.error('Error reading file:', error);
                    chatContent.innerHTML = '<div class="empty-state"><h2>Error Reading File</h2><p>Please try again</p></div>';
                }
            }

            function readFileAsUTF8(file) {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = reject;
                    reader.readAsText(file, 'UTF-8');
                });
            }

            function parseWhatsAppChat(text) {
                const lines = text.split('\n');
                const messages = [];
                const senderCounts = {};
                let currentMessage = null;

                const patterns = [
                    /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*(am|pm|AM|PM|午前|午後)?\s*-\s*([^:]+):\s*(.+)$/i,
                    /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*(am|pm|AM|PM)?\]\s*([^:]+):\s*(.+)$/i,
                    /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*(am|pm|AM|PM|午前|午後)?\s*-\s*(.+)$/i
                ];

                for (let rawLine of lines) {
                    let line = rawLine.trim();
                    if (!line) continue;

                    let matched = false;

                    for (let pattern of patterns) {
                        const match = line.match(pattern);
                        if (match) {
                            if (currentMessage) {
                                messages.push(currentMessage);
                                if (!currentMessage.isSystem) {
                                    senderCounts[currentMessage.sender] = (senderCounts[currentMessage.sender] || 0) + 1;
                                }
                            }

                            let date, time, ampm, sender, message;
                            if (pattern === patterns[0] || pattern === patterns[1]) {
                                [, date, time, ampm, sender, message] = match;
                                let formattedTime = time.trim();
                                if (ampm) formattedTime += ' ' + ampm.toLowerCase().trim();

                                currentMessage = {
                                    date: date.trim(),
                                    time: formattedTime,
                                    sender: sender.trim(),
                                    message: message.trim(),
                                    isSystem: false
                                };

                                if (message.toLowerCase().includes('is a contact') || sender.toLowerCase().includes('system')) {
                                    currentMessage.isSystem = true;
                                }
                            } else {
                                [, date, time, ampm, message] = match;
                                let formattedTime = time.trim();
                                if (ampm) formattedTime += ' ' + ampm.toLowerCase().trim();

                                currentMessage = {
                                    date: date.trim(),
                                    time: formattedTime,
                                    sender: 'System',
                                    message: message.trim(),
                                    isSystem: true
                                };
                            }

                            matched = true;
                            break;
                        }
                    }

                    if (!matched) {
                        if (currentMessage && !currentMessage.isSystem) {
                            currentMessage.message += '\n' + line;
                        } else {
                            currentMessage = {
                                date: '',
                                time: '',
                                sender: 'System',
                                message: line,
                                isSystem: true
                            };
                            messages.push(currentMessage);
                            currentMessage = null;
                        }
                    }
                }

                if (currentMessage) {
                    messages.push(currentMessage);
                    if (!currentMessage.isSystem) {
                        senderCounts[currentMessage.sender] = (senderCounts[currentMessage.sender] || 0) + 1;
                    }
                }

                const sortedSenders = Object.entries(senderCounts)
                    .sort((a,b) => b[1] - a[1])
                    .map(e => e[0]);

                const myName = sortedSenders[0] || '';
                const localReceiverName = sortedSenders[1] || 'Contact';

                messages.forEach(msg => {
                    msg.isMine = msg.sender === myName;

                    const editedTagRegex = /<[^>]*edited[^>]*>/i;
                    if (!msg.isSystem && editedTagRegex.test(msg.message)) {
                        msg.isEdited = true;
                        msg.message = msg.message.replace(editedTagRegex, '').trim();
                    } else {
                        msg.isEdited = false;
                    }

                    if (!msg.isSystem) {
                        const lower = msg.message.toLowerCase();
                        if (lower === 'you deleted this message' || lower === 'this message was deleted' || lower.includes('deleted this message')) {
                            msg.isDeleted = true;
                            if (msg.isMine) {
                                msg.message = 'You deleted this message';
                            } else {
                                msg.message = 'This message was deleted';
                            }
                        } else {
                            msg.isDeleted = false;
                        }
                    } else {
                        msg.isDeleted = false;
                    }

                    if (msg.isSystem && (msg.message.toLowerCase().includes('end-to-end encrypted') || msg.message.toLowerCase().includes('messages and calls are'))) {
                        msg.isEncryption = true;
                    } else {
                        msg.isEncryption = false;
                    }
                    
                    if (msg.isSystem && (
                        msg.message.toLowerCase().includes('this business works') ||
                        msg.message.toLowerCase().includes('this business is now working') ||
                        msg.message.toLowerCase().includes('this business is now using')
                    )) {
                        msg.isBusiness = true;
                    } else {
                        msg.isBusiness = false;
                    }
                });

                return { messages, myName, receiverName: localReceiverName };
            }

            function renderChat(data) {
                const { messages } = data;
                chatContent.innerHTML = '';

                let lastDate = '';
                let lastSender = null;
                let lastTime = null;
                let lastShownTime = null;

                messages.forEach((msg, index) => {
                    if (msg.date && msg.date !== lastDate) {
                        const dateSeparator = document.createElement('div');
                        dateSeparator.className = 'date-separator';
                        dateSeparator.innerHTML = `<span class="date-badge">${formatDate(msg.date)}</span>`;
                        chatContent.appendChild(dateSeparator);
                        lastDate = msg.date;
                    }

                    if (msg.isSystem) {
                        const systemMsg = document.createElement('div');
                        systemMsg.style.textAlign = 'center';

                        let cssClass = 'system-message';
                        if (msg.isEncryption) cssClass += ' encryption';
                        if (msg.isBusiness) cssClass += ' business';

                        systemMsg.innerHTML = `<span class="${cssClass}">${msg.message}</span>`;
                        chatContent.appendChild(systemMsg);
                        lastSender = null;
                        lastTime = null;
                        lastShownTime = null;
                        return;
                    }

                    const messageDiv = document.createElement('div');
                    messageDiv.className = `message ${msg.isMine ? 'sent' : 'received'}`;

                    const bubble = document.createElement('div');
                    bubble.className = `bubble ${msg.isMine ? 'sent' : 'received'}`;

                    if (msg.isDeleted) {
                        bubble.classList.add('deleted');
                    }

                    const isFirstInBlock = msg.sender !== lastSender;
                    
                    let isLastInBlock = false;
                    for (let i = index + 1; i < messages.length; i++) {
                        if (!messages[i].isSystem) {
                            isLastInBlock = messages[i].sender !== msg.sender;
                            break;
                        }
                    }
                    if (index === messages.length - 1 || (isLastInBlock && index + 1 === messages.length)) {
                        isLastInBlock = true;
                    }
                    let allRemainingAreSystem = true;
                    for (let i = index + 1; i < messages.length; i++) {
                        if (!messages[i].isSystem) {
                            allRemainingAreSystem = false;
                            break;
                        }
                    }
                    if (allRemainingAreSystem) {
                        isLastInBlock = true;
                    }

                    if (isFirstInBlock) {
                        bubble.classList.add('first-in-block');

                        const senderName = document.createElement('div');
                        senderName.className = 'sender-name';
                        senderName.textContent = msg.sender;
                        bubble.appendChild(senderName);

                        lastSender = msg.sender;
                        lastTime = null;
                        lastShownTime = null;
                    }
                    
                    if (isLastInBlock) {
                        bubble.classList.add('last-in-block');
                    }

                    if (msg.isDeleted) {
                        const messageText = document.createElement('div');
                        messageText.className = 'message-text';

                        const iconSpan = document.createElement('span');
                        iconSpan.className = 'delete-icon';
                        iconSpan.setAttribute('aria-hidden', 'true');
                        iconSpan.textContent = '🚫';

                        const textSpan = document.createElement('span');
                        textSpan.textContent = msg.message;

                        messageText.appendChild(iconSpan);
                        messageText.appendChild(textSpan);
                        bubble.appendChild(messageText);
                    } else {
                        if (msg.message.includes('(file attached)') || msg.message.match(/\.(jpg|png|pdf|jpeg|gif|mp4|mp3)$/i)) {
                            const fileDiv = document.createElement('div');
                            fileDiv.className = 'file-attachment';
                            fileDiv.innerHTML = `📎 ${msg.message}`;
                            bubble.appendChild(fileDiv);
                        } else {
                            const messageText = document.createElement('div');
                            messageText.className = 'message-text';
                            messageText.textContent = msg.message;
                            bubble.appendChild(messageText);
                        }
                    }

                    const footer = document.createElement('div');
                    footer.className = 'message-footer';

                    const shouldShowTimestamp = (msg.time !== lastShownTime);
                    
                    if (msg.isEdited && !msg.isDeleted) {
                        const editedSpan = document.createElement('span');
                        editedSpan.className = 'edited-label';
                        editedSpan.textContent = 'Edited';
                        footer.appendChild(editedSpan);
                    }

                    if (shouldShowTimestamp) { 
                        const timeSpan = document.createElement('span');
                        timeSpan.className = 'time-text';
                        timeSpan.textContent = msg.time;
                        footer.appendChild(timeSpan);
                        lastShownTime = msg.time;
                    }

                    if (footer.children.length > 0) {
                        bubble.appendChild(footer);
                    }

                    messageDiv.appendChild(bubble);
                    chatContent.appendChild(messageDiv);
                    
                    lastTime = msg.time;
                });
            }

            function exportToPDF() {
                window.print();
            }

            function formatDate(dateStr) {
                if (!dateStr) return '';
                const parts = dateStr.split('/');
                if (parts.length === 3) {
                    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                    const day = parseInt(parts[0]);
                    const month = parseInt(parts[1]) - 1;
                    const year = parts[2].length === 2 ? '20' + parts[2] : parts[2];
                    if (!isNaN(month) && months[month]) {
                        return `${day} ${months[month]} ${year}`;
                    }
                }
                return dateStr;
            }
        });
