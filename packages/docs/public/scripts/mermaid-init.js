// Initialize Mermaid diagrams
(function() {
  function initMermaid() {
    if (typeof mermaid === 'undefined') return;

    // Initialize mermaid first
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default'
    });

    // Find all code blocks with language-mermaid class
    var codeBlocks = document.querySelectorAll('pre code.language-mermaid');
    codeBlocks.forEach(function(codeBlock) {
      // Create a mermaid div with the content
      var div = document.createElement('div');
      div.className = 'mermaid';
      div.textContent = codeBlock.textContent;
      // Replace the pre element with the mermaid div
      codeBlock.parentElement.replaceWith(div);
    });

    // Render all mermaid diagrams
    if (codeBlocks.length > 0) {
      mermaid.run();
    }
  }

  // Try multiple times to ensure it runs
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMermaid);
  } else {
    initMermaid();
  }
})();
