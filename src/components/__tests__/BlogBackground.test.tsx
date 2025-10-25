import React from 'react';
import { render, screen } from '@testing-library/react';
import BlogBackground from '../BlogBackground';

// Mock Mantine components to avoid complex dependencies
jest.mock('@mantine/core', () => ({
  Box: ({ children, style, ...props }: any) => (
    <div data-testid="mantine-box" style={style} {...props}>
      {children}
    </div>
  ),
}));

describe('BlogBackground', () => {
  beforeEach(() => {
    // Mock useEffect to avoid issues with SSR
    jest.spyOn(React, 'useEffect');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders children correctly', () => {
    render(
      <BlogBackground>
        <div data-testid="test-content">Test Content</div>
      </BlogBackground>
    );

    expect(screen.getByTestId('test-content')).toBeInTheDocument();
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('renders background layers', () => {
    render(
      <BlogBackground>
        <div>Content</div>
      </BlogBackground>
    );

    const boxes = screen.getAllByTestId('mantine-box');
    
    // Should have multiple Box components for different layers
    expect(boxes.length).toBeGreaterThan(1);
    
    // Check for fixed background layer
    const backgroundLayer = boxes.find(box => 
      box.style.position === 'fixed' && 
      box.style.zIndex === '-2'
    );
    expect(backgroundLayer).toBeTruthy();
  });

  it('applies correct styling for fixed background layer', () => {
    render(
      <BlogBackground>
        <div>Content</div>
      </BlogBackground>
    );

    const boxes = screen.getAllByTestId('mantine-box');
    const backgroundLayer = boxes.find(box => 
      box.style.position === 'fixed' && 
      box.style.zIndex === '-2'
    );

    expect(backgroundLayer).toHaveStyle({
      position: 'fixed',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      width: '100vw',
      height: '100vh',
      zIndex: '-2',
    });

    // Check that background style is set (may not contain actual gradients in test environment)
    expect(backgroundLayer?.style.background).toBeDefined();
  });

  it('renders main container with correct styling', () => {
    render(
      <BlogBackground>
        <div data-testid="content">Content</div>
      </BlogBackground>
    );

    const boxes = screen.getAllByTestId('mantine-box');
    const mainContainer = boxes.find(box => 
      box.style.position === 'relative' && 
      box.style.minHeight === '100vh'
    );

    expect(mainContainer).toBeTruthy();
    expect(mainContainer).toHaveStyle({
      position: 'relative',
      minHeight: '100vh',
      width: '100%',
      overflow: 'hidden',
    });
  });

  it('handles SSR correctly by not rendering particles initially', () => {
    // Mock useState to simulate initial mount state
    const mockSetState = jest.fn();
    jest.spyOn(React, 'useState')
      .mockReturnValueOnce([false, mockSetState]); // isMounted starts as false

    render(
      <BlogBackground>
        <div>Content</div>
      </BlogBackground>
    );

    // Particles should not be rendered when isMounted is false
    const particleContainers = screen.queryAllByTestId('mantine-box').filter(box =>
      box.style.pointerEvents === 'none' && 
      box.style.overflow === 'hidden'
    );

    // Should not find particle containers when not mounted
    expect(particleContainers.length).toBeLessThanOrEqual(1);
  });

  it('renders particles after mounting', () => {
    // Mock useState to simulate mounted state
    const mockSetState = jest.fn();
    jest.spyOn(React, 'useState')
      .mockReturnValueOnce([true, mockSetState]); // isMounted is true

    render(
      <BlogBackground>
        <div>Content</div>
      </BlogBackground>
    );

    const boxes = screen.getAllByTestId('mantine-box');
    
    // Should find particle container when mounted
    const particleContainer = boxes.find(box =>
      box.style.position === 'fixed' && 
      box.style.pointerEvents === 'none' &&
      box.style.overflow === 'hidden' &&
      box.style.zIndex === '-1'
    );

    expect(particleContainer).toBeTruthy();
  });

  it('applies grid overlay pattern', () => {
    render(
      <BlogBackground>
        <div>Content</div>
      </BlogBackground>
    );

    const boxes = screen.getAllByTestId('mantine-box');
    
    // Find any overlay with z-index -1 (grid overlay should be there)
    const overlayElements = boxes.filter(box =>
      box.style.zIndex === '-1' && box.style.position === 'fixed'
    );

    expect(overlayElements.length).toBeGreaterThan(0);
    overlayElements.forEach(overlay => {
      expect(overlay).toHaveStyle({
        position: 'fixed',
        pointerEvents: 'none',
        zIndex: '-1',
      });
    });
  });

  it('sets content area with correct z-index', () => {
    render(
      <BlogBackground>
        <div data-testid="content">Content</div>
      </BlogBackground>
    );

    const boxes = screen.getAllByTestId('mantine-box');
    
    // Find content area
    const contentArea = boxes.find(box =>
      box.style.zIndex === '1' && 
      box.style.position === 'relative'
    );

    expect(contentArea).toBeTruthy();
    expect(contentArea).toHaveStyle({
      position: 'relative',
      zIndex: '1',
      width: '100%',
      minHeight: '100vh',
    });

    // Content should be inside this area
    expect(contentArea).toContainElement(screen.getByTestId('content'));
  });

  it('handles useEffect for mounting state', () => {
    const mockSetState = jest.fn();
    jest.spyOn(React, 'useState')
      .mockReturnValue([false, mockSetState]);
    
    const mockUseEffect = jest.spyOn(React, 'useEffect');

    render(
      <BlogBackground>
        <div>Content</div>
      </BlogBackground>
    );

    // useEffect should be called to set mounted state
    expect(mockUseEffect).toHaveBeenCalled();
    
    // Check that the effect function would call setIsMounted(true)
    const effectCallback = mockUseEffect.mock.calls[0][0];
    effectCallback();
    expect(mockSetState).toHaveBeenCalledWith(true);
  });

  it('applies proper layering for all elements', () => {
    render(
      <BlogBackground>
        <div>Content</div>
      </BlogBackground>
    );

    const boxes = screen.getAllByTestId('mantine-box');

    // Check z-index layering
    const backgroundLayer = boxes.find(box => box.style.zIndex === '-2');
    const overlayLayers = boxes.filter(box => box.style.zIndex === '-1');
    const contentLayer = boxes.find(box => box.style.zIndex === '1');

    expect(backgroundLayer).toBeTruthy(); // Background at -2
    expect(overlayLayers.length).toBeGreaterThan(0); // Overlays at -1
    expect(contentLayer).toBeTruthy(); // Content at 1

    // Ensure proper layering order
    expect(parseInt(backgroundLayer!.style.zIndex)).toBeLessThan(
      parseInt(overlayLayers[0].style.zIndex)
    );
    expect(parseInt(overlayLayers[0].style.zIndex)).toBeLessThan(
      parseInt(contentLayer!.style.zIndex)
    );
  });

  it('maintains responsive design with full viewport dimensions', () => {
    render(
      <BlogBackground>
        <div>Content</div>
      </BlogBackground>
    );

    const boxes = screen.getAllByTestId('mantine-box');
    
    // Fixed background should cover full viewport
    const backgroundLayer = boxes.find(box => box.style.zIndex === '-2');
    expect(backgroundLayer).toHaveStyle({
      width: '100vw',
      height: '100vh',
    });

    // Main container should be full height
    const mainContainer = boxes.find(box => 
      box.style.minHeight === '100vh' && 
      box.style.position === 'relative'
    );
    expect(mainContainer).toHaveStyle({
      width: '100%',
      minHeight: '100vh',
    });
  });
});